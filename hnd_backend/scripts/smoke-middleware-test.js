(async () => {
  try {
    // Monkey-patch materialAccessService to avoid DB dependencies
    const materialAccessService = require('../services/materialAccessService');
    materialAccessService.hasActiveAccess = async (userId, materialId, materialType, accessType) => {
      console.log('[mock] hasActiveAccess', { userId, materialId, materialType, accessType });
      return true;
    };
    materialAccessService.getRemainingAccessTime = async () => 3600;

    const middleware = require('../middlewares/materialAccessMiddleware');
    const check = middleware.checkMaterialAccess('report', 'preview');

    const req = {
      user: { id: '000000000000000000000001', cand_id: 'CAND00001', program: 'HND', dpt_id: null },
      params: { id: '507f1f77bcf86cd799439011' },
      body: {},
    };

    const res = {
      status(code) {
        console.log('[res] status', code);
        return { json: (obj) => console.log('[res] json', obj) };
      },
    };

    let nextCalled = false;
    const next = () => {
      nextCalled = true;
      console.log('[next] called');
    };

    await check(req, res, next);
    console.log('[result] nextCalled=', nextCalled);
    console.log('[result] req.materialAccess=', req.materialAccess);
  } catch (err) {
    console.error('[error]', err);
    process.exit(2);
  }
})();
