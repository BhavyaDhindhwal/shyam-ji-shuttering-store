
const { Resend } = require("resend");

let resendClient = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is missing from Render Environment Variables");
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

async function sendOwnerOtpEmail({
  to,
  otp,
  expiresInMinutes = 5,
}) {
  const resend = getResendClient();

  const fromEmail =
    process.env.EMAIL_FROM ||
    "Shyam Ji Shuttering Store <onboarding@resend.dev>";

  const result = await resend.emails.send({
    from: fromEmail,
    to: [to],
    subject: "Your Owner Login OTP - Shyam Ji Shuttering Store",

    text: `
Shyam Ji Shuttering Store

Your owner login OTP is:

${otp}

This OTP will expire in ${expiresInMinutes} minutes.

If you did not request this OTP, please ignore this email.

Regards,
Shyam Ji Shuttering Store
    `.trim(),

    html: `
      <div style="font-family:Arial,sans-serif;background:#f4f6fa;padding:30px;">
        <div style="max-width:520px;margin:auto;background:white;border-radius:12px;overflow:hidden;">
          <div style="background:#020617;padding:28px;color:white;">
            <h2 style="color:#ffd700;margin:0;">SHYAM JI</h2>
            <h3 style="margin-bottom:0;">Shuttering Store</h3>
          </div>

          <div style="padding:35px;">
            <p style="color:#d5a84b;font-weight:bold;">OWNER VERIFICATION</p>
            <h2 style="color:#071d49;">Your Login OTP</h2>

            <p>Use this one-time password to access your management portal.</p>

            <div style="background:#f7f9fd;padding:25px;text-align:center;border-radius:10px;">
              <p style="color:#667085;">ONE-TIME PASSWORD</p>
              <h1 style="color:#0b3d91;letter-spacing:8px;">${otp}</h1>
            </div>

            <p>This OTP expires in <strong>${expiresInMinutes} minutes</strong>.</p>
            <p style="color:#98a2b3;font-size:12px;">
              If you did not request this login, ignore this email.
            </p>
          </div>

          <div style="background:#020617;color:#98a2b3;padding:20px;font-size:12px;">
            Automated security email from Shyam Ji Shuttering Store.
          </div>
        </div>
      </div>
    `,
  });

  if (result.error) {
    console.error("Resend email error:", result.error);
    throw new Error("Unable to send OTP email");
  }

  console.log(`OTP email sent successfully to ${to}`);
  console.log(`Resend Email ID: ${result.data.id}`);

  return result.data;
}

module.exports = {
  sendOwnerOtpEmail,
};
