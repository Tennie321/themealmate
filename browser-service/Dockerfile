FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /service
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY security.js automation.js server.js ./
RUN mkdir -p /home/pwuser/profile && chown -R pwuser:pwuser /home/pwuser/profile /service
USER pwuser
ENV NODE_ENV=production PORT=8787 PROFILE_DIR=/home/pwuser/profile
EXPOSE 8787
CMD ["node", "server.js"]
