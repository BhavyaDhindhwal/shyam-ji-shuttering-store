const nodemailer = require("nodemailer");

let transporter = null;

function createTransporter() {
  if (transporter) {
    return transporter;
  }

  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_APP_PASSWORD;

  if (!emailUser || !emailPassword) {
    throw new Error(
      "EMAIL_USER or EMAIL_APP_PASSWORD is missing from backend/.env"
    );
  }

  transporter = nodemailer.createTransport({
    service: "gmail",

    auth: {
      user: emailUser,
      pass: emailPassword,
    },

    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporter;
}

async function sendOwnerOtpEmail({
  to,
  otp,
  expiresInMinutes = 5,
}) {
  const mailTransporter = createTransporter();

  const fromName =
    process.env.EMAIL_FROM_NAME ||
    "Shyam Ji Shuttering Store";

  const fromEmail =
    process.env.EMAIL_USER;

  const info = await mailTransporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,

    to,

    subject:
      "Your Owner Login OTP - Shyam Ji Shuttering Store",

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
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>Owner Login OTP</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f4f6fa;
    font-family:Arial,Helvetica,sans-serif;
  "
>

  <table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="background:#f4f6fa;padding:40px 15px;"
  >

    <tr>
      <td align="center">

        <table
          width="560"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            max-width:560px;
            width:100%;
            background:#ffffff;
            border-radius:14px;
            overflow:hidden;
            box-shadow:0 12px 35px rgba(2,6,23,0.10);
          "
        >

          <!-- HEADER -->

          <tr>
            <td
              style="
                padding:32px;
                background:#020617;
                color:#ffffff;
              "
            >

              <div
                style="
                  color:#ffd700;
                  font-size:13px;
                  font-weight:bold;
                  letter-spacing:2px;
                  margin-bottom:8px;
                "
              >
                SHYAM JI
              </div>

              <div
                style="
                  font-size:24px;
                  font-family:Georgia,serif;
                "
              >
                Shuttering Store
              </div>

            </td>
          </tr>

          <!-- CONTENT -->

          <tr>
            <td style="padding:40px 35px;">

              <div
                style="
                  color:#d5a84b;
                  font-size:10px;
                  font-weight:bold;
                  letter-spacing:2px;
                  margin-bottom:10px;
                "
              >
                OWNER VERIFICATION
              </div>

              <h1
                style="
                  margin:0;
                  color:#071d49;
                  font-family:Georgia,serif;
                  font-size:30px;
                  font-weight:normal;
                "
              >
                Your login OTP
              </h1>

              <p
                style="
                  color:#667085;
                  font-size:14px;
                  line-height:1.7;
                  margin:18px 0 25px;
                "
              >
                Use the following one-time password
                to access the Shyam Ji Shuttering Store
                management portal.
              </p>

              <!-- OTP -->

              <div
                style="
                  text-align:center;
                  padding:25px;
                  background:#f7f9fd;
                  border:1px solid #e5e9f0;
                  border-radius:10px;
                "
              >

                <div
                  style="
                    color:#667085;
                    font-size:10px;
                    font-weight:bold;
                    letter-spacing:2px;
                    margin-bottom:12px;
                  "
                >
                  ONE-TIME PASSWORD
                </div>

                <div
                  style="
                    color:#0b3d91;
                    font-size:34px;
                    font-weight:bold;
                    letter-spacing:8px;
                  "
                >
                  ${otp}
                </div>

              </div>

              <p
                style="
                  color:#667085;
                  font-size:12px;
                  line-height:1.6;
                  margin:22px 0 0;
                "
              >
                This OTP expires in
                <strong>
                  ${expiresInMinutes} minutes
                </strong>.
              </p>

              <p
                style="
                  color:#98a2b3;
                  font-size:11px;
                  line-height:1.6;
                  margin-top:25px;
                "
              >
                If you did not request this login,
                you can safely ignore this email.
              </p>

            </td>
          </tr>

          <!-- FOOTER -->

          <tr>
            <td
              style="
                padding:22px 35px;
                background:#020617;
                color:#98a2b3;
                font-size:10px;
                line-height:1.6;
              "
            >
              This is an automated security email from
              Shyam Ji Shuttering Store.
            </td>
          </tr>

        </table>

      </td>
    </tr>

  </table>

</body>
</html>
    `.trim(),
  });

  console.log(
    `📧 Owner OTP email sent successfully to ${to}`
  );

  console.log(
    `📨 Message ID: ${info.messageId}`
  );

  return info;
}

async function verifyEmailConnection() {
  const mailTransporter = createTransporter();

  await mailTransporter.verify();

  console.log(
    "✅ Gmail SMTP connection verified"
  );

  return true;
}

module.exports = {
  sendOwnerOtpEmail,
  verifyEmailConnection,
};