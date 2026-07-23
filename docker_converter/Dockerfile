FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/usr/lib/libreoffice/program:${PATH}"
ENV PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-core \
    libreoffice-writer \
    libreoffice-impress \
    libreoffice-common \
    libreoffice-java-common \
    default-jre-headless \
    fonts-dejavu \
    fonts-liberation \
    fontconfig \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME="/usr/lib/jvm/default-java"
ENV PATH="/usr/lib/libreoffice/program:${PATH}"

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 8080
CMD ["node", "server.js"]
