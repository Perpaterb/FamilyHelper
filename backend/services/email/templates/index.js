/**
 * Email Templates
 *
 * Template functions that generate email subject, text, and HTML content.
 * Each template is a function that takes data and returns {subject, text, html}.
 *
 * @module services/email/templates
 */

/**
 * Welcome email template
 * Sent when a new user registers
 *
 * @param {Object} data - Template data
 * @param {string} data.userName - User's name or email
 * @param {string} data.loginUrl - URL to login to the app
 * @returns {Object} Email content {subject, text, html}
 */
function welcome(data) {
  const { userName, loginUrl } = data;

  const subject = 'Welcome to Family Helper!';

  const text = `
Hi ${userName},

Welcome to Family Helper! We're excited to have you on board.

Family Helper makes co-parenting easier with:
- Secure messaging between parents, children, and caregivers
- Shared calendar for scheduling and responsibilities
- Financial tracking for child-related expenses
- Complete audit logs for transparency

Your account has been created successfully. You can now:
1. Log in at: ${loginUrl}
2. Create or join a family group
3. Start coordinating with your co-parents

You're on a 20-day free trial. During this time, you can explore all features with:
- One admin per group
- 10GB of storage for logs, images, and videos

After the trial, subscribe for just $3 USD/month to continue as an admin.

Need help? Contact support@familyhelperapp.com

Best regards,
The Family Helper Team
`.trim();

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #2c3e50;">Welcome to Family Helper!</h1>

  <p>Hi ${userName},</p>

  <p>We're excited to have you on board! Family Helper makes co-parenting easier with:</p>

  <ul>
    <li>Secure messaging between parents, children, and caregivers</li>
    <li>Shared calendar for scheduling and responsibilities</li>
    <li>Financial tracking for child-related expenses</li>
    <li>Complete audit logs for transparency</li>
  </ul>

  <h2 style="color: #2c3e50;">Get Started</h2>

  <p>Your account has been created successfully. Here's what to do next:</p>

  <ol>
    <li>Log in to your account</li>
    <li>Create or join a family group</li>
    <li>Start coordinating with your co-parents</li>
  </ol>

  <a href="${loginUrl}" style="display: inline-block; background: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0;">
    Log In Now
  </a>

  <h2 style="color: #2c3e50;">Your Free Trial</h2>

  <p>You're on a <strong>20-day free trial</strong> with:</p>
  <ul>
    <li>One admin per group</li>
    <li>10GB of storage for logs, images, and videos</li>
  </ul>

  <p>After the trial, subscribe for just <strong>$3 USD/month</strong> to continue as an admin.</p>

  <hr style="border: none; border-top: 1px solid #ecf0f1; margin: 30px 0;">

  <p style="color: #7f8c8d; font-size: 14px;">
    Need help? Contact support@familyhelperapp.com
  </p>

  <p style="color: #7f8c8d; font-size: 14px;">
    Best regards,<br>
    The Family Helper Team
  </p>
</div>
`.trim();

  return { subject, text, html };
}

/**
 * Trial reminder email template
 * Sent when trial is expiring
 *
 * @param {Object} data - Template data
 * @param {string} data.userName - User's name or email
 * @param {number} data.daysLeft - Days remaining in trial
 * @param {string} data.subscribeUrl - URL to subscribe
 * @returns {Object} Email content {subject, text, html}
 */
function trial_reminder(data) {
  const { userName, daysLeft, subscribeUrl } = data;

  const subject = `Your Family Helper trial expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`;

  const text = `
Hi ${userName},

Your 20-day free trial of Family Helper will expire in ${daysLeft} day${daysLeft > 1 ? 's' : ''}.

To continue using Family Helper as a group admin, please subscribe before your trial ends.

Subscription Details:
- Price: $3 USD/month
- Includes: 10GB storage (logs, images, videos)
- Additional storage: $1 USD per 10GB/month
- Cancel anytime

Subscribe now: ${subscribeUrl}

What happens if you don't subscribe:
- Your group will be archived (read-only)
- All data will be preserved
- You can reactivate by subscribing later

Questions? Contact support@familyhelperapp.com

Best regards,
The Family Helper Team
`.trim();

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #e74c3c;">Trial Expiring Soon</h1>

  <p>Hi ${userName},</p>

  <p>Your 20-day free trial will expire in <strong>${daysLeft} day${daysLeft > 1 ? 's' : ''}</strong>.</p>

  <p>To continue using Family Helper as a group admin, please subscribe before your trial ends.</p>

  <div style="background: #ecf0f1; padding: 20px; border-radius: 4px; margin: 20px 0;">
    <h2 style="color: #2c3e50; margin-top: 0;">Subscription Details</h2>
    <ul style="margin: 0;">
      <li>Price: <strong>$3 USD/month</strong></li>
      <li>Includes: 10GB storage (logs, images, videos)</li>
      <li>Additional storage: $1 USD per 10GB/month</li>
      <li>Cancel anytime</li>
    </ul>
  </div>

  <a href="${subscribeUrl}" style="display: inline-block; background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0;">
    Subscribe Now
  </a>

  <h3 style="color: #2c3e50;">What happens if you don't subscribe:</h3>
  <ul>
    <li>Your group will be archived (read-only)</li>
    <li>All data will be preserved</li>
    <li>You can reactivate by subscribing later</li>
  </ul>

  <hr style="border: none; border-top: 1px solid #ecf0f1; margin: 30px 0;">

  <p style="color: #7f8c8d; font-size: 14px;">
    Questions? Contact support@familyhelperapp.com
  </p>

  <p style="color: #7f8c8d; font-size: 14px;">
    Best regards,<br>
    The Family Helper Team
  </p>
</div>
`.trim();

  return { subject, text, html };
}

/**
 * Log export email template
 * Sent when audit log export is ready
 *
 * @param {Object} data - Template data
 * @param {string} data.userName - User's name or email
 * @param {string} data.groupName - Name of the group
 * @param {string} data.downloadUrl - URL to download logs (password protected)
 * @param {string} data.password - Password for the export file
 * @param {string} data.expiresIn - How long the link is valid (e.g., "7 days")
 * @returns {Object} Email content {subject, text, html}
 */
function log_export(data) {
  const { userName, groupName, downloadUrl, password, expiresIn } = data;

  const subject = `Your ${groupName} audit log export is ready`;

  const text = `
Hi ${userName},

Your audit log export for "${groupName}" is ready to download.

Download Link: ${downloadUrl}
Password: ${password}

This link expires in ${expiresIn}.

The export includes:
- All group messages (including hidden messages)
- Calendar events and responsibilities
- Financial matters and payments
- Media attachments (images, videos)
- Complete audit trail with timestamps

Important:
- The download is password-protected for security
- Hidden messages are visible (you requested full logs)
- Media links are temporary signed URLs
- Save the export if you need long-term records

Questions? Contact support@familyhelperapp.com

Best regards,
The Family Helper Team
`.trim();

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #27ae60;">Log Export Ready</h1>

  <p>Hi ${userName},</p>

  <p>Your audit log export for <strong>"${groupName}"</strong> is ready to download.</p>

  <div style="background: #ecf0f1; padding: 20px; border-radius: 4px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Download Link:</strong></p>
    <a href="${downloadUrl}" style="color: #3498db; word-break: break-all;">${downloadUrl}</a>

    <p style="margin: 20px 0 10px 0;"><strong>Password:</strong></p>
    <code style="background: white; padding: 8px 12px; border-radius: 3px; display: inline-block; font-size: 16px; letter-spacing: 1px;">
      ${password}
    </code>

    <p style="margin: 20px 0 0 0; color: #e74c3c; font-size: 14px;">
      ⏰ This link expires in ${expiresIn}
    </p>
  </div>

  <h2 style="color: #2c3e50;">What's Included:</h2>
  <ul>
    <li>All group messages (including hidden messages)</li>
    <li>Calendar events and responsibilities</li>
    <li>Financial matters and payments</li>
    <li>Media attachments (images, videos)</li>
    <li>Complete audit trail with timestamps</li>
  </ul>

  <div style="background: #fff3cd; border-left: 4px solid #f39c12; padding: 15px; margin: 20px 0;">
    <h3 style="color: #f39c12; margin-top: 0;">Important:</h3>
    <ul style="margin: 0;">
      <li>The download is password-protected for security</li>
      <li>Hidden messages are visible (you requested full logs)</li>
      <li>Media links are temporary signed URLs</li>
      <li>Save the export if you need long-term records</li>
    </ul>
  </div>

  <hr style="border: none; border-top: 1px solid #ecf0f1; margin: 30px 0;">

  <p style="color: #7f8c8d; font-size: 14px;">
    Questions? Contact support@familyhelperapp.com
  </p>

  <p style="color: #7f8c8d; font-size: 14px;">
    Best regards,<br>
    The Family Helper Team
  </p>
</div>
`.trim();

  return { subject, text, html };
}

/**
 * Group invitation email template
 * Sent when a user is invited to join a group
 *
 * @param {Object} data - Template data
 * @param {string} data.recipientName - Recipient's name
 * @param {string} data.groupName - Name of the group
 * @param {string} data.inviterName - Name of the person who invited them
 * @param {string} data.role - Role in the group (admin, parent, child, etc.)
 * @param {string} data.appUrl - URL to the app
 * @returns {Object} Email content {subject, text, html}
 */
function group_invitation(data) {
  const { recipientName, groupName, inviterName, role, appUrl } = data;

  const subject = `You've been invited to join "${groupName}" on Family Helper`;

  const text = `
Hi ${recipientName},

${inviterName} has invited you to join the group "${groupName}" on Family Helper!

Your Role: ${role.charAt(0).toUpperCase() + role.slice(1)}

Family Helper helps families coordinate with:
- Secure messaging between family members
- Shared calendar for scheduling
- Financial tracking for shared expenses
- Document storage and wiki
- Complete audit logs for transparency

To accept this invitation:
1. Log in to Family Helper at: ${appUrl}
2. Check your pending invitations
3. Accept or decline the invitation

If you don't have an account yet, you can create one for free at ${appUrl}.

Questions? Contact support@familyhelperapp.com

Best regards,
The Family Helper Team

---
Family Helper App
${appUrl}
`.trim();

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
  <div style="background: linear-gradient(135deg, #6200ee 0%, #9c4dcc 100%); padding: 30px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">You're Invited!</h1>
  </div>

  <div style="padding: 30px;">
    <p style="font-size: 16px; color: #333;">Hi ${recipientName},</p>

    <p style="font-size: 16px; color: #333;">
      <strong>${inviterName}</strong> has invited you to join the group <strong>"${groupName}"</strong> on Family Helper!
    </p>

    <div style="background: #f8f4ff; border-left: 4px solid #6200ee; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #6200ee; font-weight: bold;">Your Role: ${role.charAt(0).toUpperCase() + role.slice(1)}</p>
    </div>

    <h2 style="color: #333; font-size: 18px;">What is Family Helper?</h2>
    <p style="color: #666;">Family Helper makes family coordination easier with:</p>
    <ul style="color: #666;">
      <li>Secure messaging between family members</li>
      <li>Shared calendar for scheduling</li>
      <li>Financial tracking for shared expenses</li>
      <li>Document storage and wiki</li>
      <li>Complete audit logs for transparency</li>
    </ul>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${appUrl}" style="display: inline-block; background: #6200ee; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
        View Invitation
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">
      Don't have an account yet? Create one for free when you click the button above.
    </p>
  </div>

  <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
    <p style="color: #999; font-size: 12px; margin: 0 0 10px 0;">
      Questions? Contact support@familyhelperapp.com
    </p>
    <p style="color: #999; font-size: 12px; margin: 0;">
      <strong>Family Helper App</strong><br>
      <a href="${appUrl}" style="color: #6200ee;">${appUrl}</a>
    </p>
  </div>
</div>
`.trim();

  return { subject, text, html };
}

/**
 * Finance matter notification email template
 * Sent when a user is added as a participant in a finance matter
 *
 * @param {Object} data - Template data
 * @param {string} data.recipientName - Recipient's name
 * @param {string} data.groupName - Name of the group
 * @param {string} data.matterTitle - Title of the finance matter
 * @param {string} data.matterType - Type of finance matter (expense, income, etc.)
 * @param {string} data.amount - Amount (formatted with currency)
 * @param {string} data.createdBy - Name of person who created it
 * @param {string} data.appUrl - URL to the app
 * @returns {Object} Email content {subject, text, html}
 */
function finance_matter_added(data) {
  const { recipientName, groupName, matterTitle, matterType, amount, createdBy, appUrl } = data;

  const subject = `You've been added to a finance matter: "${matterTitle}"`;

  const text = `
Hi ${recipientName},

${createdBy} has added you to a finance matter in "${groupName}".

Details:
- Title: ${matterTitle}
- Type: ${matterType}
- Amount: ${amount}

To view this finance matter and manage your participation:
1. Log in to Family Helper at: ${appUrl}
2. Navigate to the "${groupName}" group
3. Go to Finance

Questions? Contact support@familyhelperapp.com

Best regards,
The Family Helper Team

---
Family Helper App
${appUrl}
`.trim();

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
  <div style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); padding: 30px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">💰 Finance Matter Update</h1>
  </div>

  <div style="padding: 30px;">
    <p style="font-size: 16px; color: #333;">Hi ${recipientName},</p>

    <p style="font-size: 16px; color: #333;">
      <strong>${createdBy}</strong> has added you to a finance matter in <strong>"${groupName}"</strong>.
    </p>

    <div style="background: #e8f5e9; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #2e7d32;">${matterTitle}</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;">Type:</td>
          <td style="padding: 8px 0; color: #333; font-weight: bold;">${matterType}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Amount:</td>
          <td style="padding: 8px 0; color: #2e7d32; font-weight: bold; font-size: 18px;">${amount}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${appUrl}" style="display: inline-block; background: #4caf50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
        View Finance Matter
      </a>
    </div>
  </div>

  <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
    <p style="color: #999; font-size: 12px; margin: 0 0 10px 0;">
      Questions? Contact support@familyhelperapp.com
    </p>
    <p style="color: #999; font-size: 12px; margin: 0;">
      <strong>Family Helper App</strong><br>
      <a href="${appUrl}" style="color: #4caf50;">${appUrl}</a>
    </p>
  </div>
</div>
`.trim();

  return { subject, text, html };
}

/**
 * Secret Santa participant added email template
 * Sent when a participant is added to a Secret Santa event
 *
 * @param {Object} data - Template data
 * @param {string} data.recipientName - Participant's name
 * @param {string} data.eventName - Name of the Secret Santa event
 * @param {string} data.occasion - Occasion for the event (optional)
 * @param {string} data.exchangeDate - Date of gift exchange (optional)
 * @param {string} data.priceLimit - Price limit (optional)
 * @param {string} data.passcode - Access code for the participant
 * @param {string} data.secretSantaUrl - URL to view the Secret Santa
 * @param {string} data.appUrl - Main app URL
 * @returns {Object} Email content {subject, text, html}
 */
function secret_santa_added(data) {
  const { recipientName, eventName, occasion, exchangeDate, priceLimit, passcode, secretSantaUrl, appUrl } = data;

  const subject = `🎁 You've been added to "${eventName}" Secret Santa!`;

  const text = `
Hi ${recipientName},

You've been added to the Secret Santa event "${eventName}"!

Event Details:
${occasion ? `- Occasion: ${occasion}` : ''}
${exchangeDate ? `- Exchange Date: ${exchangeDate}` : ''}
${priceLimit ? `- Gift Value: ${priceLimit}` : ''}

You'll receive another email when the Secret Santa assignments are ready.

To view your assignment when it's ready:
${secretSantaUrl}

Your access code: ${passcode}

Keep this code safe! You'll need it to see who you're buying for.

Questions? Contact support@familyhelperapp.com

Best regards,
The Family Helper Team

---
Family Helper App
${appUrl}
`.trim();

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
  <div style="background: linear-gradient(135deg, #c62828 0%, #f44336 100%); padding: 30px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🎁 Secret Santa</h1>
    <p style="color: #ffcdd2; margin: 10px 0 0 0; font-size: 16px;">${eventName}</p>
  </div>

  <div style="padding: 30px;">
    <p style="font-size: 16px; color: #333;">Hi ${recipientName},</p>

    <p style="font-size: 16px; color: #333;">
      You've been added to the Secret Santa event <strong>"${eventName}"</strong>! 🎄
    </p>

    <div style="background: #ffebee; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #c62828;">Event Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        ${occasion ? `<tr>
          <td style="padding: 8px 0; color: #666;">Occasion:</td>
          <td style="padding: 8px 0; color: #333; font-weight: bold;">${occasion}</td>
        </tr>` : ''}
        ${exchangeDate ? `<tr>
          <td style="padding: 8px 0; color: #666;">Exchange Date:</td>
          <td style="padding: 8px 0; color: #333; font-weight: bold;">${exchangeDate}</td>
        </tr>` : ''}
        ${priceLimit ? `<tr>
          <td style="padding: 8px 0; color: #666;">Gift Value:</td>
          <td style="padding: 8px 0; color: #c62828; font-weight: bold;">${priceLimit}</td>
        </tr>` : ''}
      </table>
    </div>

    <p style="font-size: 14px; color: #666; text-align: center;">
      You'll receive another email when assignments are ready!
    </p>

    <div style="background: #fff3e0; border: 2px dashed #ff9800; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 10px 0; color: #e65100; font-weight: bold;">Your Access Code</p>
      <p style="margin: 0; font-size: 28px; font-family: monospace; color: #333; letter-spacing: 3px;">${passcode}</p>
      <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">Keep this code safe!</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${secretSantaUrl}" style="display: inline-block; background: #c62828; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
        View Secret Santa
      </a>
    </div>
  </div>

  <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
    <p style="color: #999; font-size: 12px; margin: 0 0 10px 0;">
      Questions? Contact support@familyhelperapp.com
    </p>
    <p style="color: #999; font-size: 12px; margin: 0;">
      <strong>Family Helper App</strong><br>
      <a href="${appUrl}" style="color: #c62828;">${appUrl}</a>
    </p>
  </div>
</div>
`.trim();

  return { subject, text, html };
}

/**
 * Secret Santa match reveal email template
 * Sent when Secret Santa assignments are revealed
 *
 * @param {Object} data - Template data
 * @param {string} data.recipientName - Participant's name (the giver)
 * @param {string} data.eventName - Name of the Secret Santa event
 * @param {string} data.matchName - Name of the person they're buying for
 * @param {string} data.exchangeDate - Date of gift exchange (optional)
 * @param {string} data.priceLimit - Price limit (optional)
 * @param {string} data.wishlistUrl - URL to view recipient's wishlist (optional)
 * @param {string} data.secretSantaUrl - URL to view the Secret Santa
 * @param {string} data.appUrl - Main app URL
 * @returns {Object} Email content {subject, text, html}
 */
function secret_santa_match(data) {
  const { recipientName, eventName, matchName, exchangeDate, priceLimit, wishlistUrl, secretSantaUrl, appUrl } = data;

  const subject = `🎅 Your Secret Santa match is ready!`;

  const text = `
Hi ${recipientName},

The Secret Santa assignments for "${eventName}" are in!

🎁 You are buying a gift for: ${matchName}

${exchangeDate ? `Exchange Date: ${exchangeDate}` : ''}
${priceLimit ? `Gift Value: ${priceLimit}` : ''}

${wishlistUrl ? `View their wishlist: ${wishlistUrl}` : ''}

View your assignment: ${secretSantaUrl}

Remember - keep it a surprise! 🤫

Best regards,
The Family Helper Team

---
Family Helper App
${appUrl}
`.trim();

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
  <div style="background: linear-gradient(135deg, #2e7d32 0%, #4caf50 100%); padding: 30px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎅 It's Time!</h1>
    <p style="color: #c8e6c9; margin: 10px 0 0 0; font-size: 16px;">Your Secret Santa match is ready</p>
  </div>

  <div style="padding: 30px;">
    <p style="font-size: 16px; color: #333;">Hi ${recipientName},</p>

    <p style="font-size: 16px; color: #333;">
      The Secret Santa assignments for <strong>"${eventName}"</strong> are in!
    </p>

    <div style="background: linear-gradient(135deg, #c62828 0%, #f44336 100%); border-radius: 12px; padding: 30px; margin: 25px 0; text-align: center;">
      <p style="color: #ffcdd2; margin: 0 0 10px 0; font-size: 14px;">You are buying a gift for...</p>
      <p style="color: #ffffff; margin: 0; font-size: 32px; font-weight: bold;">🎁 ${matchName}</p>
    </div>

    ${exchangeDate || priceLimit ? `
    <div style="background: #f5f5f5; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        ${exchangeDate ? `<tr>
          <td style="padding: 5px 0; color: #666;">Exchange Date:</td>
          <td style="padding: 5px 0; color: #333; font-weight: bold;">${exchangeDate}</td>
        </tr>` : ''}
        ${priceLimit ? `<tr>
          <td style="padding: 5px 0; color: #666;">Gift Value:</td>
          <td style="padding: 5px 0; color: #2e7d32; font-weight: bold;">${priceLimit}</td>
        </tr>` : ''}
      </table>
    </div>
    ` : ''}

    ${wishlistUrl ? `
    <div style="text-align: center; margin: 20px 0;">
      <a href="${wishlistUrl}" style="display: inline-block; background: #ff9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
        📝 View Wishlist
      </a>
    </div>
    ` : ''}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${secretSantaUrl}" style="display: inline-block; background: #2e7d32; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
        View Secret Santa
      </a>
    </div>

    <p style="text-align: center; color: #666; font-size: 18px;">
      Remember - keep it a surprise! 🤫
    </p>
  </div>

  <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
    <p style="color: #999; font-size: 12px; margin: 0;">
      <strong>Family Helper App</strong><br>
      <a href="${appUrl}" style="color: #2e7d32;">${appUrl}</a>
    </p>
  </div>
</div>
`.trim();

  return { subject, text, html };
}

/**
 * Billing reminder email template
 * Sent 5 days and 1 day before subscription/trial renewal date
 *
 * @param {Object} data - Template data
 * @param {string} data.userName - User's name or email
 * @param {number} data.daysUntilDue - Days until payment is due
 * @param {string} data.dueDate - Formatted due date (DD-MMM-YYYY)
 * @param {string} data.storageUsedGb - Storage used in GB (e.g., "5.23")
 * @param {number} data.storagePacks - Number of additional storage packs
 * @param {string} data.storageCharges - Storage charges formatted (e.g., "1.00")
 * @param {string} data.totalAmount - Total amount formatted (e.g., "4.00")
 * @param {string} data.payNowUrl - URL to the subscription page
 * @returns {Object} Email content {subject, text, html}
 */
function billing_reminder(data) {
  const { userName, daysUntilDue, dueDate, storageUsedGb, storagePacks, storageCharges, totalAmount, payNowUrl } = data;

  const dayText = daysUntilDue === 1 ? 'day' : 'days';
  const subject = `Your Family Helper payment is due in ${daysUntilDue} ${dayText}`;

  const text = `
Hi ${userName},

Your subscription payment is due on ${dueDate}.

COST BREAKDOWN:
- Admin Subscription: $3.00 USD
- Storage Used: ${storageUsedGb} GB
- Additional Storage (${storagePacks} packs × 10GB): $${storageCharges} USD
- TOTAL DUE: $${totalAmount} USD

Pay now: ${payNowUrl}

IMPORTANT:
1. Reduced your storage? Click "Regenerate Bill" on the subscription
   page to get updated pricing before paying.

2. If payment is not received by ${dueDate}:
   - Groups where you're the ONLY admin will become READ-ONLY for everyone
   - Groups with other admins: You'll lose admin access (demoted to member)

Questions? Contact support@familyhelperapp.com

Best regards,
The Family Helper Team
`.trim();

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
  <div style="background: linear-gradient(135deg, #6200ee 0%, #9c4dcc 100%); padding: 30px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Payment Due Soon</h1>
    <p style="color: #e1bee7; margin: 10px 0 0 0; font-size: 16px;">Due in ${daysUntilDue} ${dayText}</p>
  </div>

  <div style="padding: 30px;">
    <p style="font-size: 16px; color: #333;">Hi ${userName},</p>

    <p style="font-size: 16px; color: #333;">
      Your subscription payment is due on <strong>${dueDate}</strong>.
    </p>

    <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 25px 0;">
      <h3 style="margin: 0 0 15px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 10px;">Cost Breakdown</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;">Admin Subscription</td>
          <td style="padding: 8px 0; color: #333; text-align: right;">$3.00 USD</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Storage Used</td>
          <td style="padding: 8px 0; color: #333; text-align: right;">${storageUsedGb} GB</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Additional Storage (${storagePacks} × 10GB)</td>
          <td style="padding: 8px 0; color: #333; text-align: right;">$${storageCharges} USD</td>
        </tr>
        <tr style="border-top: 2px solid #6200ee;">
          <td style="padding: 12px 0 8px 0; color: #333; font-weight: bold; font-size: 18px;">TOTAL DUE</td>
          <td style="padding: 12px 0 8px 0; color: #6200ee; font-weight: bold; font-size: 18px; text-align: right;">$${totalAmount} USD</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${payNowUrl}" style="display: inline-block; background: #6200ee; color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px;">
        Pay Now
      </a>
    </div>

    <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 25px 0;">
      <h4 style="margin: 0 0 10px 0; color: #e65100;">💡 Reduced your storage?</h4>
      <p style="margin: 0; color: #666; font-size: 14px;">
        Click "Regenerate Bill" on the subscription page to get updated pricing before paying.
      </p>
    </div>

    <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 25px 0;">
      <h4 style="margin: 0 0 10px 0; color: #c62828;">⚠️ If payment is not received by ${dueDate}:</h4>
      <ul style="margin: 0; color: #666; font-size: 14px; padding-left: 20px;">
        <li>Groups where you're the ONLY admin will become <strong>READ-ONLY</strong> for everyone</li>
        <li>Groups with other admins: You'll lose admin access (demoted to member)</li>
      </ul>
    </div>
  </div>

  <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
    <p style="color: #999; font-size: 12px; margin: 0 0 10px 0;">
      Questions? Contact support@familyhelperapp.com
    </p>
    <p style="color: #999; font-size: 12px; margin: 0;">
      <strong>Family Helper App</strong>
    </p>
  </div>
</div>
`.trim();

  return { subject, text, html };
}

/**
 * Support ticket email template
 * Sent when a user submits feedback or support request
 *
 * @param {Object} data - Template data
 * @param {string} data.userName - User's display name
 * @param {string} data.userEmail - User's email address
 * @param {string} data.userId - User's unique ID
 * @param {string} data.message - Feedback/support message
 * @param {string} data.subscriptionStatus - User's subscription status
 * @param {string} data.trialEndsAt - Trial end date (if applicable)
 * @param {number} data.groupCount - Number of groups user belongs to
 * @param {number} data.adminGroupCount - Number of groups where user is admin
 * @param {string} data.submittedAt - Timestamp of submission
 * @returns {Object} Email content {subject, text, html}
 */
function support_ticket(data) {
  const {
    userName,
    userEmail,
    userId,
    message,
    subscriptionStatus,
    trialEndsAt,
    groupCount,
    adminGroupCount,
    submittedAt,
  } = data;

  const subject = `Support Ticket from Family Helper App - ${userName}`;

  const text = `
SUPPORT TICKET FROM FAMILY HELPER APP
=====================================

Submitted: ${submittedAt}

USER DETAILS:
- Name: ${userName}
- Email: ${userEmail}
- User ID: ${userId}
- Subscription: ${subscriptionStatus}
${trialEndsAt ? `- Trial Ends: ${trialEndsAt}` : ''}
- Total Groups: ${groupCount}
- Admin of Groups: ${adminGroupCount}

MESSAGE:
--------
${message}

---
This ticket was submitted via the Family Helper App.
Reply to: ${userEmail}
`.trim();

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background-color: #ffffff;">
  <div style="background: linear-gradient(135deg, #6200ee 0%, #9c4dcc 100%); padding: 30px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Support Ticket</h1>
    <p style="color: #e1bee7; margin: 10px 0 0 0; font-size: 14px;">Family Helper App</p>
  </div>

  <div style="padding: 30px;">
    <p style="font-size: 12px; color: #999; margin: 0 0 20px 0;">
      Submitted: ${submittedAt}
    </p>

    <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
      <h2 style="margin: 0 0 15px 0; color: #333; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 10px;">
        User Details
      </h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 140px;">Name:</td>
          <td style="padding: 8px 0; color: #333; font-weight: bold;">${userName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Email:</td>
          <td style="padding: 8px 0; color: #333;">
            <a href="mailto:${userEmail}" style="color: #6200ee;">${userEmail}</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">User ID:</td>
          <td style="padding: 8px 0; color: #333; font-family: monospace; font-size: 12px;">${userId}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Subscription:</td>
          <td style="padding: 8px 0;">
            <span style="display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; ${
              subscriptionStatus === 'active' || subscriptionStatus === 'permanent'
                ? 'background: #e8f5e9; color: #2e7d32;'
                : subscriptionStatus === 'trial'
                ? 'background: #fff3e0; color: #e65100;'
                : 'background: #ffebee; color: #c62828;'
            }">
              ${subscriptionStatus.toUpperCase()}
            </span>
          </td>
        </tr>
        ${trialEndsAt ? `
        <tr>
          <td style="padding: 8px 0; color: #666;">Trial Ends:</td>
          <td style="padding: 8px 0; color: #e65100; font-weight: bold;">${trialEndsAt}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #666;">Total Groups:</td>
          <td style="padding: 8px 0; color: #333;">${groupCount}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Admin of Groups:</td>
          <td style="padding: 8px 0; color: #333;">${adminGroupCount}</td>
        </tr>
      </table>
    </div>

    <div style="background: #fff; border: 2px solid #6200ee; border-radius: 8px; padding: 20px;">
      <h2 style="margin: 0 0 15px 0; color: #6200ee; font-size: 16px;">
        Message
      </h2>
      <div style="color: #333; line-height: 1.6; white-space: pre-wrap;">${message}</div>
    </div>

    <div style="margin-top: 25px; text-align: center;">
      <a href="mailto:${userEmail}" style="display: inline-block; background: #6200ee; color: white; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: bold;">
        Reply to User
      </a>
    </div>
  </div>

  <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
    <p style="color: #999; font-size: 12px; margin: 0;">
      This support ticket was submitted via the Family Helper App.
    </p>
  </div>
</div>
`.trim();

  return { subject, text, html };
}

module.exports = {
  welcome,
  trial_reminder,
  log_export,
  group_invitation,
  finance_matter_added,
  secret_santa_added,
  secret_santa_match,
  billing_reminder,
  support_ticket,
};
