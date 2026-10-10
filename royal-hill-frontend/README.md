# Royal Hill Dairy

React storefront and Express/PostgreSQL order backend.

## Local development

1. Copy .env.example to .env and set DATABASE_URL, SESSION_SECRET, and ADMIN_PASSWORD.
2. Install packages with npm install.
3. In one terminal, run npm start for the API.
4. In another terminal, run npm run start:frontend for the React development server.
5. Open localhost:3000 for the shop or localhost:3000/admin for the dashboard.

The backend creates its customer_orders table and recent-entry index at startup. Product and subscription requests are saved with customer name, phone, delivery address, PIN code, requested items, total, payment preference, and consent time. Dashboard entries are ordered newest first.

This checkout records requests only. It does not process payments or confirm deliveries.

## Render

render.yaml defines the web service and a persistent Postgres database in Singapore. The web service is on Render's free plan; the database uses the smallest paid persistent plan so customer entries do not expire. During Blueprint setup, set a long, unique ADMIN_PASSWORD. Render generates SESSION_SECRET and supplies the internal database connection string.

Open /admin on the deployed site to view requests after signing in.
