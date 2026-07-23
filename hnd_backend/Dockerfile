FROM node:20-bookworm

WORKDIR /app

# Install LibreOffice and fonts for DOCX/PPTX to PDF conversion on server.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-core \
    libreoffice-writer \
    libreoffice-impress \
    libreoffice-common \
    fonts-dejavu \
    fonts-liberation \
    fontconfig \
    ca-certificates \
    curl \
    default-jre \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/bin:/usr/lib/libreoffice/program:${PATH}"
ENV LIBREOFFICE_PATH="/usr/bin/soffice"

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "start"]
