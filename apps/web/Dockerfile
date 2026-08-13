FROM node:20-alpine
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY package*.json ./
RUN npm install

COPY . .

# Ensure clean build - remove any cached .next
RUN rm -rf .next

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
