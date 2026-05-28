FROM node:20-bookworm

WORKDIR /app

# Install LibreOffice and fonts for DOCX/PPTX to PDF conversion on server.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    libreoffice-writer \
    libreoffice-impress \
    fonts-dejavu \
    fonts-liberation \
    fontconfig \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "start"]
