# PlayBook India — Full-stack booking website

This is a working MVP, not just a static UI. It includes:

- Responsive PlayBook India design based on the uploaded screenshots
- Customer signup/login/logout with hashed passwords
- Cookie-based sessions using JWT
- Persistent SQLite database
- Venue search by city/activity
- Venue owner accounts and venue submission
- Owner venue management view
- Date + live slot availability
- Booking creation with slot conflict protection
- Razorpay payment integration when keys are configured
- Demo payment mode when Razorpay keys are not configured
- Razorpay signature verification on the server
- Customer booking history
- Admin role and basic admin statistics API
- Seeded demo venues and accounts

## Run locally

1. Install Node.js 18+.
2. Open this folder in a terminal.
3. Run:

```bash
npm install
```

4. Copy `.env.example` to `.env` and set a strong `JWT_SECRET`.
5. For real Razorpay payments, add your Razorpay Key ID and Key Secret to `.env`.
6. Start:

```bash
npm start
```

7. Open `http://localhost:3000`.

## Demo accounts

Customer: create an account from the site.

Owner:
- Email: `owner@playbook.local`
- Password: `Owner123!`

Admin:
- Email: `admin@playbook.local`
- Password: `ChangeMe123!`

Change the admin password before any real deployment.

## Razorpay

Without Razorpay keys, the site intentionally runs in demo-payment mode so the booking flow can be tested locally.

For real payments, create/configure Razorpay credentials in `.env`. Never put the secret key in frontend code. The server creates the order and verifies the payment signature.

## Production work still recommended

Before opening the service publicly, add HTTPS, production cookie settings, rate limiting, email/SMS OTP, stronger validation, CSRF protection as appropriate, image upload/storage, Google/Mapbox maps, refunds/cancellation policy, webhook handling for payment reconciliation, venue verification workflow, monitoring, backups, and deployment secrets.
