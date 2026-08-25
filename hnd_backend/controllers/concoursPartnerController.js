const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const PaymentTransaction = require("../models/PaymentTransaction");
const { sendEmail } = require("../services/emailService");
const { getPricingSnapshot } = require("../services/platformPricingService");
const {
  startCampayPayment,
} = require("../services/paymentOrchestrationService");
const {
  createAndStoreAgreement,
  LOGIN_URL,
} = require("../services/concoursAgreementService");
const { isDeveloper } = require("../middlewares/concoursAuthorization");
const ConcoursAuditLog = require("../models/ConcoursAuditLog");
const ConcoursAssignment = require("../models/ConcoursAssignment");

const actor = (req) => String(req.user?.cand_id || "system");
const generatePartnerPassword = () =>
  String(crypto.randomInt(10000000, 100000000));
exports.list = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const filter = { role: "concour_partner" };
    if (q)
      filter.$or = [
        { name: new RegExp(q, "i") },
        { email: new RegExp(q, "i") },
        { "organization.name": new RegExp(q, "i") },
      ];
    const partners = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({ success: true, partners });
  } catch (err) {
    return next(err);
  }
};
exports.create = async (req, res, next) => {
  try {
    const {
      organizationName,
      contactPerson,
      email,
      phone,
      address,
      website,
      description,
    } = req.body || {};
    if (!organizationName || !contactPerson || !email || !phone)
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Organization, contact person, email, and phone are required",
        });
    if (await User.exists({ email: String(email).toLowerCase().trim() }))
      return res
        .status(409)
        .json({ success: false, message: "Email is already in use" });
    const password = generatePartnerPassword();
    const partner = new User({
      cand_id: `PARTNER${crypto.randomInt(10000, 100000)}`,
      name: contactPerson,
      email: String(email).toLowerCase().trim(),
      phone,
      address,
      password,
      role: "concour_partner",
      program: "HND",
      account_status: "active",
      organization: {
        name: organizationName,
        contact_person: contactPerson,
        website,
        description,
      },
      partnership: { status: "created" },
    });
    await partner.save();
    const pricing = await getPricingSnapshot();
    const amount = pricing.concoursPartnership.amount;
    const currency = pricing.concoursPartnership.currency;
    const agreement = await createAndStoreAgreement({
      partner,
      amount,
      currency,
    });
    partner.partnership.status = "agreement_sent";
    partner.partnership.agreement = {
      version: agreement.version,
      storage_key: agreement.storageKey,
      generated_at: agreement.generatedAt,
    };
    await partner.save();
    await sendEmail({
      to: partner.email,
      subject: "Your ACADEX Concours Partner account",
      text: [
        `Hello ${partner.name},`,
        "",
        `Your organization account has been created. Login: ${LOGIN_URL}`,
        `Temporary password: ${password}`,
        `Yearly partnership fee: ${amount.toFixed(2)} ${currency}`,
        "Please sign in, review the agreement, and complete activation in the partner portal.",
      ].join("\n"),
      attachments: [
        { filename: `${agreement.reference}.pdf`, content: agreement.buffer },
      ],
    });
    return res
      .status(201)
      .json({
        success: true,
        partner: {
          id: partner._id,
          cand_id: partner.cand_id,
          email: partner.email,
          partnership: partner.partnership,
        },
      });
  } catch (err) {
    return next(err);
  }
};
exports.acceptAgreement = async (req, res, next) => {
  try {
    const partner = await User.findOne({
      cand_id: req.user.cand_id,
      role: "concour_partner",
    });
    if (!partner)
      return res
        .status(404)
        .json({ success: false, message: "Partner not found" });
    if (partner.partnership?.status === "terminated")
      return res
        .status(403)
        .json({ success: false, message: "Partnership terminated" });
    const pricing = await getPricingSnapshot();
    partner.partnership.status = "agreement_accepted";
    partner.partnership.agreement.accepted_at = new Date();
    partner.partnership.agreement.accepted_by = actor(req);
    await partner.save();
    await ConcoursAuditLog.create({
      event: "partnership.agreement.accepted",
      actorId: actor(req),
      partnerId: partner._id,
      metadata: { agreementVersion: partner.partnership.agreement.version },
    });
    if (pricing.concoursPartnership.amount <= 0) {
      partner.partnership.status = "active";
      partner.partnership.start_at = new Date();
      partner.partnership.expires_at = new Date(
        Date.now() + pricing.concoursPartnership.durationDays * 86400000,
      );
      await partner.save();
      await ConcoursAuditLog.create({
        event: "partnership.activated.free",
        actorId: actor(req),
        partnerId: partner._id,
      });
    }
    return res.json({ success: true, partnership: partner.partnership });
  } catch (err) {
    return next(err);
  }
};
exports.checkout = async (req, res, next) => {
  try {
    const partner = await User.findOne({
      cand_id: req.user.cand_id,
      role: "concour_partner",
    });
    if (
      !partner ||
      !["agreement_accepted", "payment_required"].includes(
        partner.partnership?.status,
      )
    )
      return res
        .status(400)
        .json({ success: false, message: "Agreement acceptance is required" });
    const pricing = await getPricingSnapshot();
    const partnershipPricing = pricing.concoursPartnership;
    if (partnershipPricing.amount <= 0)
      return res
        .status(400)
        .json({
          success: false,
          message: "No payment is required for the current partnership price",
        });
    partner.partnership.status = "payment_required";
    await partner.save();
    const existing = await PaymentTransaction.findOne({
      user_cand_id: partner.cand_id,
      purpose_type: "concours_partnership",
      status: "pending",
    }).sort({ createdAt: -1 });
    if (existing)
      return res.json({
        success: true,
        pricing: partnershipPricing,
        payment: existing,
      });
    const transaction = await startCampayPayment({
      transactionPayload: {
        user_cand_id: partner.cand_id,
        provider: "camerpay",
        purpose_type: "concours_partnership",
        purpose_code: "concours_partnership_yearly",
        resource_type: "concours_partnership",
        resource_id: String(partner._id),
        amount: partnershipPricing.amount,
        currency: partnershipPricing.currency,
        phone_number: partner.phone,
        description: "ACADEX Concours Partnership yearly fee",
        external_reference: `ACPP-${partner.cand_id}-${Date.now()}`,
        external_id: `partner-${partner.cand_id}`,
        metadata: {
          partner_id: String(partner._id),
          duration_days: partnershipPricing.durationDays,
        },
      },
      phoneNumber: partner.phone,
      payerMessage: "ACADEX Concours Partnership",
      payeeNote: "ACADEX Concours Partnership",
      paymentMethod: req.body?.paymentMethod || "momo",
    });
    return res.json({
      success: true,
      pricing: partnershipPricing,
      payment: transaction,
    });
  } catch (err) {
    return next(err);
  }
};
exports.status = async (req, res, next) => {
  try {
    const partner = await User.findOne({
      cand_id: req.user.cand_id,
      role: "concour_partner",
    })
      .select("partnership organization")
      .lean();
    const pricing = await getPricingSnapshot();
    return res.json({
      success: true,
      partnership: partner?.partnership || null,
      organization: partner?.organization || null,
      pricing: pricing.concoursPartnership,
    });
  } catch (err) {
    return next(err);
  }
};
exports.paymentStatus = async (req, res, next) => {
  try {
    const partner = await User.findOne({
      cand_id: req.user.cand_id,
      role: "concour_partner",
    })
      .select("partnership")
      .lean();
    if (!partner)
      return res
        .status(404)
        .json({ success: false, message: "Partner not found" });
    const transaction = await PaymentTransaction.findOne({
      user_cand_id: req.user.cand_id,
      purpose_type: "concours_partnership",
    })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({
      success: true,
      partnershipStatus: partner.partnership?.status || null,
      payment: transaction
        ? {
            id: transaction._id,
            status: transaction.status,
            providerReference: transaction.provider_reference,
            createdAt: transaction.createdAt,
            completedAt: transaction.completedAt,
          }
        : null,
    });
  } catch (err) {
    return next(err);
  }
};
exports.setStatus = async (req, res, next) => {
  try {
    if (!isDeveloper(req))
      return res
        .status(403)
        .json({ success: false, message: "Developer access required" });
    const allowed = ["active", "suspended", "terminated", "expired"];
    if (!allowed.includes(req.body?.status))
      return res
        .status(400)
        .json({ success: false, message: "Invalid partnership status" });
    const partner = await User.findOne({
      _id: req.params.partnerId,
      role: "concour_partner",
    });
    if (!partner)
      return res
        .status(404)
        .json({ success: false, message: "Partner not found" });
    partner.partnership.status = req.body.status;
    await partner.save();
    await ConcoursAuditLog.create({
      event: `partnership.${req.body.status}`,
      actorId: actor(req),
      partnerId: partner._id,
    });
    return res.json({ success: true, partnership: partner.partnership });
  } catch (err) {
    return next(err);
  }
};
exports.update = async (req, res, next) => {
  try {
    if (!isDeveloper(req))
      return res
        .status(403)
        .json({ success: false, message: "Developer access required" });
    const partner = await User.findOne({
      _id: req.params.partnerId,
      role: "concour_partner",
    });
    if (!partner)
      return res
        .status(404)
        .json({ success: false, message: "Partner not found" });
    const {
      organizationName,
      contactPerson,
      email,
      phone,
      address,
      website,
      description,
    } = req.body || {};
    if (email && String(email).toLowerCase().trim() !== partner.email) {
      const duplicate = await User.exists({
        email: String(email).toLowerCase().trim(),
        _id: { $ne: partner._id },
      });
      if (duplicate)
        return res
          .status(409)
          .json({ success: false, message: "Email is already in use" });
    }
    if (organizationName !== undefined)
      partner.organization.name = String(organizationName).trim();
    if (contactPerson !== undefined) {
      partner.name = String(contactPerson).trim();
      partner.organization.contact_person = partner.name;
    }
    if (email !== undefined) partner.email = String(email).toLowerCase().trim();
    if (phone !== undefined) partner.phone = String(phone).trim();
    if (address !== undefined) partner.address = String(address).trim();
    if (website !== undefined)
      partner.organization.website = String(website).trim();
    if (description !== undefined)
      partner.organization.description = String(description).trim();
    await partner.save();
    return res.json({ success: true, partner: partner.toObject() });
  } catch (err) {
    return next(err);
  }
};
exports.assignAdmin = async (req, res, next) => {
  try {
    if (!isDeveloper(req))
      return res
        .status(403)
        .json({ success: false, message: "Developer access required" });
    const [partner, admin] = await Promise.all([
      User.findOne({
        _id: req.params.partnerId,
        role: "concour_partner",
      }).select("_id"),
      User.findOne({ cand_id: req.body?.adminCandId, role: { $in: ["admin", "developer"] } }).select(
        "_id",
      ),
    ]);
    if (!partner || !admin)
      return res
        .status(404)
        .json({ success: false, message: "Partner or admin not found" });
    const assignment = await ConcoursAssignment.findOneAndUpdate(
      { partnerId: partner._id, adminId: admin._id },
      { $set: { assignedBy: actor(req), active: req.body?.active !== false } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await ConcoursAuditLog.create({
      event: "partnership.admin.assigned",
      actorId: actor(req),
      partnerId: partner._id,
      metadata: { adminId: String(admin._id), active: assignment.active },
    });
    return res.json({ success: true, assignment });
  } catch (err) {
    return next(err);
  }
};
