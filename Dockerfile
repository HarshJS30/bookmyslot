FROM node:22

WORKDIR /app

COPY package.json package-lock.json ./

COPY prisma ./prisma

RUN npm ci

RUN npm install --no-save lightningcss-linux-x64-gnu@$(node -p "JSON.parse(require('fs').readFileSync('node_modules/lightningcss/package.json')).version") @tailwindcss/oxide-linux-x64-gnu@$(node -p "JSON.parse(require('fs').readFileSync('node_modules/@tailwindcss/oxide/package.json')).version")

COPY . .

ARG NEXT_PUBLIC_REALTIME_URL

RUN npx prisma generate

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]