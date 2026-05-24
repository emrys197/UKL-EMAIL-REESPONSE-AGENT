import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are an elite FCA-compliant UK debt collection email agent for United Kash Limited.

REGULATORY FRAMEWORK:
- FCA CONC 7: Fair treatment in arrears/default. No oppressive tactics. Signpost free debt advice.
- FCA Consumer Duty FG22/5: Act in good faith. CLEAR, FAIR, NOT MISLEADING. More empathy if vulnerability indicated.
- CSA Guidelines: Professional, respectful, firm but supportive.

TONE: Professional, firm, direct. NOT apologetic. UK English. No emojis. No threats. Empathy increases if vulnerability mentioned.

SINGLE ACCOUNT — OUTPUT FORMAT (use when only one account is present):
{
  "multi_account": false,
  "subject": "...",
  "customer_name": "...",
  "account_ref": "...",
  "balance": "...",
  "pin": "...",
  "where_things_stand": "...",
  "what_you_need_to_do": "...",
  "settlement_note": "",
  "agent_name": "Collections Team",
  "important": "If payment is not received as agreed, the account may continue through the collections process. Please be aware that automated communications may continue until a payment or arrangement is confirmed.",
  "acknowledgement": "By replying to this email, selecting a repayment plan, or making a payment, you confirm that you acknowledge the outstanding balance and accept responsibility for repaying this account in line with the agreed terms.",
  "vulnerability_flags": [],
  "support_orgs": []
}

DUAL ACCOUNT — OUTPUT FORMAT (use when two accounts are mentioned):
{
  "multi_account": true,
  "subject": "...",
  "customer_name": "...",
  "account1_ref": "...",
  "account1_balance": "...",
  "account1_pin": "...",
  "account1_status": "...",
  "account2_ref": "...",
  "account2_balance": "...",
  "account2_pin": "...",
  "account2_status": "...",
  "where_things_stand": "...",
  "what_you_need_to_do": "...",
  "settlement_note": "",
  "agent_name": "Collections Team",
  "important": "If payment is not received as agreed, the account may continue through the collections process. Please be aware that automated communications may continue until a payment or arrangement is confirmed.",
  "acknowledgement": "By replying to this email, selecting a repayment plan, or making a payment, you confirm that you acknowledge the outstanding balance and accept responsibility for repaying this account in line with the agreed terms.",
  "vulnerability_flags": [],
  "support_orgs": []
}

RULES:
- multi_account: set true only if two distinct accounts are mentioned, else false
- customer_name: extract first name from email or instruction, else "Customer"
- pin / account1_pin / account2_pin: scan entire email and instruction for PIN, passcode, access code, or standalone 4-6 digit number. Extract exactly. If PIN provided in instruction, use it. Else "[PIN]".
- account_ref / account1_ref / account2_ref: look for Ref:, Reference:, Account:, or alphanumeric codes (e.g. U177393). Extract exactly. Else "[ACCOUNT REF]".
- balance / account1_balance / account2_balance: extract £ amounts. If two accounts, match each balance to its reference. Else "[BALANCE]".
- account1_status / account2_status: 1-2 sentence summary of where each individual account stands (e.g. broken arrangement, payment pending, up to date).
- where_things_stand: 2-4 sentences covering the overall situation across all accounts. DO NOT mention payment methods, links, or how to pay here.
- what_you_need_to_do: Firm steps. Push for TODAY's payment on all accounts unless told otherwise. DO NOT list payment URLs, bank details, sort codes, portal links or PIN here — handled separately.
- NEVER include payment URLs, bank details, sort codes, account numbers, portal links, or PIN numbers in where_things_stand or what_you_need_to_do.
- important and acknowledgement: output word for word exactly as shown, never change them.
- agent_name: use name from instruction if given, else "Collections Team"
- Use plain text with \\n for line breaks inside JSON values
- Return ONLY valid JSON. Your entire response must be a single JSON object starting with { and ending with }. No text before, no text after, no markdown, no backticks, no explanation whatsoever.
- vulnerability_flags: an array — scan the email and instruction for any of these signals and include the relevant flag(s): "debt" (general financial difficulty), "mental_health" (mentions stress, anxiety, depression, overwhelmed, can't cope), "crisis" (mentions self-harm, suicide, can't go on), "domestic_abuse" (mentions partner controlling money, abuse, fear), "gambling" (mentions gambling, betting, chasing losses), "elderly" (mentions age, carer, pension, elderly), "housing" (mentions eviction, homeless, losing home), "none" (no vulnerability signals). If any vulnerability is detected, empathy must significantly increase and pressure must reduce.
- support_orgs: based on vulnerability_flags, select the most relevant organisations from this list and include their details in the JSON as an array:
  * Always include for any financial difficulty: {"name":"StepChange Debt Charity","type":"Debt advice","web":"stepchange.org","phone":"0800 138 1111"},{"name":"National Debtline","type":"Free debt advice","web":"nationaldebtline.org","phone":"0808 808 4000"},{"name":"Citizens Advice","type":"Debt, benefits & legal advice","web":"citizensadvice.org.uk","phone":"0800 144 8848"}
  * Add for mental_health or crisis: {"name":"Mind","type":"Mental health support","web":"mind.org.uk","phone":"0300 123 3393"},{"name":"Samaritans","type":"Emotional distress & crisis support","web":"samaritans.org","phone":"116 123"},{"name":"Rethink Mental Illness","type":"Severe mental health support","web":"rethink.org","phone":"0808 801 0525"}
  * Add for domestic_abuse: {"name":"Refuge","type":"Domestic abuse support","web":"refuge.org.uk","phone":"0808 2000 247"},{"name":"Women's Aid","type":"Domestic abuse support","web":"womensaid.org.uk","contact":"Live chat via website"},{"name":"Surviving Economic Abuse","type":"Financial & economic abuse","web":"survivingeconomicabuse.org"}
  * Add for gambling: {"name":"GamCare","type":"Gambling addiction support","web":"gamcare.org.uk","phone":"0808 8020 133"}
  * Add for housing: {"name":"Shelter","type":"Housing & homelessness support","web":"shelter.org.uk","phone":"0808 800 4444"}
  * Add for elderly: {"name":"Age UK","type":"Elderly customer support","web":"ageuk.org.uk","phone":"0800 678 1602"}
  * Add for CAP always as bonus: {"name":"CAP (Christians Against Poverty)","type":"Debt & hardship support","web":"capuk.org","phone":"0800 328 0006"}
  * For no vulnerability (standard): only include StepChange, MoneyHelper, National Debtline`;

const PORTAL_URL = "https://online.unitedkash.com/uklCustomer/index.html#payment";
const CHAT_URL = "https://online.unitedkash.com/uklCustomer/#home";
const MONEYHELPER = { name: "MoneyHelper", type: "Free financial guidance", web: "www.moneyhelper.org.uk", phone: "0800 138 7777" };
const BENEFITS_URL = "https://benefits.inbest.ai/finvence?subpartner=unitedkash";

function buildOutlookHTML(d, fields) {
  const name = d.customer_name || "Customer";
  const agent = d.agent_name || "Collections Team";
  const settlement = d.settlement_note || "";

  const para = (txt) => `<p style="margin:0 0 10px 0;font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55;mso-line-height-rule:exactly;">${txt.replace(/\n/g,"<br>")}</p>`;
  const label = (txt) => `<p style="margin:0 0 6px 0;font-family:Calibri,Arial,sans-serif;font-size:14px;font-weight:bold;color:#1a1a1a;mso-line-height-rule:exactly;">${txt}</p>`;
  const line = `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:0;line-height:0;padding:10px 0;border-bottom:1px solid #e0e0e0;"></td></tr></table>`;

  // Build account summary block
  let accountBlock = "";
  if (d.multi_account) {
    const r1 = fields.account1_ref || d.account1_ref || "[ACCOUNT REF 1]";
    const b1 = d.account1_balance ? (d.account1_balance.startsWith("£") ? d.account1_balance : `£${d.account1_balance}`) : "[BALANCE 1]";
    const p1 = (d.account1_pin && d.account1_pin !== "[PIN]") ? d.account1_pin : (fields.pin1 || "[PIN]");
    const r2 = fields.account2_ref || d.account2_ref || "[ACCOUNT REF 2]";
    const b2 = d.account2_balance ? (d.account2_balance.startsWith("£") ? d.account2_balance : `£${d.account2_balance}`) : "[BALANCE 2]";
    const p2 = (d.account2_pin && d.account2_pin !== "[PIN]") ? d.account2_pin : (fields.pin2 || "[PIN]");

    accountBlock = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
      <tr valign="top">
        <td width="49%" style="background-color:#f4f6f9;border-left:3px solid #1a2744;padding:10px 14px;border:1px solid #dde2ea;border-left:3px solid #1a2744;">
          <p style="margin:0 0 2px 0;font-family:Calibri,Arial,sans-serif;font-size:10px;font-weight:bold;color:#1a2744;text-transform:uppercase;letter-spacing:1px;">Account 1</p>
          <p style="margin:0;font-family:Calibri,Arial,sans-serif;font-size:13px;color:#1a1a1a;line-height:1.7;">
            <strong>Ref:</strong> ${r1}<br>
            <strong>Balance:</strong> ${b1}<br>
            <strong>PIN:</strong> ${p1}${d.account1_status ? `<br><span style="color:#555555;font-size:12px;">${d.account1_status}</span>` : ""}
          </p>
        </td>
        <td width="2%"></td>
        <td width="49%" style="background-color:#f4f6f9;border:1px solid #dde2ea;border-left:3px solid #c9a84c;padding:10px 14px;">
          <p style="margin:0 0 2px 0;font-family:Calibri,Arial,sans-serif;font-size:10px;font-weight:bold;color:#c9a84c;text-transform:uppercase;letter-spacing:1px;">Account 2</p>
          <p style="margin:0;font-family:Calibri,Arial,sans-serif;font-size:13px;color:#1a1a1a;line-height:1.7;">
            <strong>Ref:</strong> ${r2}<br>
            <strong>Balance:</strong> ${b2}<br>
            <strong>PIN:</strong> ${p2}${d.account2_status ? `<br><span style="color:#555555;font-size:12px;">${d.account2_status}</span>` : ""}
          </p>
        </td>
      </tr>
    </table>`;

    // Dual payment section
    const paymentBlock = `
    ${label("To make a payment, please use one of the following methods:")}
    <p style="margin:4px 0 8px 0;font-family:Calibri,Arial,sans-serif;font-size:12px;color:#555;mso-line-height-rule:exactly;">Please use the correct reference for each account when making payment.</p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
      <tr valign="top">
        <td width="49%" style="border-top:2px solid #1a2744;padding-top:8px;">
          <p style="margin:0 0 6px 0;font-family:Calibri,Arial,sans-serif;font-size:11px;font-weight:bold;color:#1a2744;text-transform:uppercase;letter-spacing:1px;">Account 1 — ${r1}</p>
          <p style="margin:0;font-family:Calibri,Arial,sans-serif;font-size:13px;color:#1a1a1a;line-height:1.7;">
            <strong>Online Portal</strong><br>
            <a href="${PORTAL_URL}" style="color:#1155cc;text-decoration:underline;">${PORTAL_URL}</a><br>
            Reference: <strong>${r1}</strong><br>
            PIN: <strong>${p1}</strong>
          </p>
          <p style="margin:8px 0 0 0;font-family:Calibri,Arial,sans-serif;font-size:13px;color:#1a1a1a;line-height:1.7;">
            <strong>Bank Transfer</strong><br>
            United Kash Limited<br>Sort Code: 20-44-51<br>Account No: 23385760<br>Reference: <strong>${r1}</strong>
          </p>
        </td>
        <td width="2%"></td>
        <td width="49%" style="border-top:2px solid #c9a84c;padding-top:8px;">
          <p style="margin:0 0 6px 0;font-family:Calibri,Arial,sans-serif;font-size:11px;font-weight:bold;color:#c9a84c;text-transform:uppercase;letter-spacing:1px;">Account 2 — ${r2}</p>
          <p style="margin:0;font-family:Calibri,Arial,sans-serif;font-size:13px;color:#1a1a1a;line-height:1.7;">
            <strong>Online Portal</strong><br>
            <a href="${PORTAL_URL}" style="color:#1155cc;text-decoration:underline;">${PORTAL_URL}</a><br>
            Reference: <strong>${r2}</strong><br>
            PIN: <strong>${p2}</strong>
          </p>
          <p style="margin:8px 0 0 0;font-family:Calibri,Arial,sans-serif;font-size:13px;color:#1a1a1a;line-height:1.7;">
            <strong>Bank Transfer</strong><br>
            United Kash Limited<br>Sort Code: 20-44-51<br>Account No: 23385760<br>Reference: <strong>${r2}</strong>
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:8px 0 0 0;font-family:Calibri,Arial,sans-serif;font-size:13px;color:#1a1a1a;line-height:1.7;">
      <strong>Live Chat</strong><br>
      <a href="${CHAT_URL}" style="color:#1155cc;text-decoration:underline;">${CHAT_URL}</a>
    </p>`;

    return buildFinalHTML({ name, agent, accountBlock, paymentBlock, d, settlement, line, para });

  } else {
    // Single account
    const ref = fields.account1_ref || d.account_ref || "[ACCOUNT REF]";
    const bal = d.balance ? (d.balance.startsWith("£") ? d.balance : `£${d.balance}`) : "[BALANCE]";
    const p = (d.pin && d.pin !== "[PIN]") ? d.pin : (fields.pin1 || "[PIN]");

    accountBlock = `<p style="margin:0 0 14px 0;font-family:Calibri,Arial,sans-serif;font-size:13px;color:#444444;mso-line-height-rule:exactly;line-height:1.6;">
      <strong>Account Reference:</strong> ${ref} &nbsp;&nbsp; <strong>Outstanding Balance:</strong> ${bal}
    </p>`;

    const paymentBlock = `
    ${label("To make a payment, please use one of the following methods:")}
    <p style="margin:10px 0 0 0;font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1a1a1a;mso-line-height-rule:exactly;line-height:1.6;">
      <strong>Online Portal</strong><br>
      <a href="${PORTAL_URL}" style="color:#1155cc;text-decoration:underline;">${PORTAL_URL}</a><br>
      Account Reference: <strong>${ref}</strong><br>PIN: <strong>${p}</strong>
    </p>
    <p style="margin:10px 0 0 0;font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1a1a1a;mso-line-height-rule:exactly;line-height:1.6;">
      <strong>Live Chat</strong><br>
      <a href="${CHAT_URL}" style="color:#1155cc;text-decoration:underline;">${CHAT_URL}</a>
    </p>
    <p style="margin:10px 0 0 0;font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1a1a1a;mso-line-height-rule:exactly;line-height:1.6;">
      <strong>Bank Transfer</strong><br>
      Account Name: United Kash Limited<br>Sort Code: 20-44-51<br>Account Number: 23385760<br>Reference: <strong>${ref}</strong>
    </p>`;

    return buildFinalHTML({ name, agent, accountBlock, paymentBlock, d, settlement, line, para });
  }
}

function buildSupportHTML(d) {
  const flags = (d.vulnerability_flags || []).filter(f => f !== "none");
  const isVulnerable = flags.length > 0;

  // Standard footer — always shown
  const standardFooter = `
    <p style="margin:0 0 4px 0;font-family:Calibri,Arial,sans-serif;font-size:13px;color:#555555;mso-line-height-rule:exactly;line-height:1.6;">
      If you are struggling financially, free support is available:<br>
      <strong>MoneyHelper</strong> — <a href="https://www.moneyhelper.org.uk" style="color:#1155cc;text-decoration:underline;">www.moneyhelper.org.uk</a> &nbsp;·&nbsp; 0800 138 7777<br>
      <strong>StepChange</strong> — <a href="https://www.stepchange.org" style="color:#1155cc;text-decoration:underline;">stepchange.org</a> &nbsp;·&nbsp; 0800 138 1111
    </p>`;

  if (!isVulnerable) return standardFooter;

  // Pick the single most relevant org per flag
  const orgMap = {
    mental_health: { intro: "We understand this may be a stressful time. If you are struggling with your mental health, please reach out for support:", name: "Mind", web: "mind.org.uk", phone: "0300 123 3393" },
    crisis:        { intro: "We are concerned about your wellbeing. If you are in crisis or need someone to talk to, please contact:", name: "Samaritans", web: "samaritans.org", phone: "116 123 (free, 24/7)" },
    domestic_abuse:{ intro: "If you are experiencing domestic abuse or your finances are being controlled by someone else, confidential support is available:", name: "Refuge", web: "refuge.org.uk", phone: "0808 2000 247 (free, 24/7)" },
    gambling:      { intro: "If gambling is affecting your finances, free confidential help is available:", name: "GamCare", web: "gamcare.org.uk", phone: "0808 8020 133" },
    housing:       { intro: "If you are at risk of losing your home or facing housing difficulties, please contact:", name: "Shelter", web: "shelter.org.uk", phone: "0808 800 4444" },
    elderly:       { intro: "If you need additional support or assistance managing your finances, Age UK can help:", name: "Age UK", web: "ageuk.org.uk", phone: "0800 678 1602" },
    debt:          { intro: "Free, impartial debt advice is available to help you manage your finances:", name: "StepChange Debt Charity", web: "stepchange.org", phone: "0800 138 1111" },
  };

  // Get the highest-priority flag (crisis > domestic_abuse > mental_health > others)
  const priority = ["crisis", "domestic_abuse", "mental_health", "gambling", "housing", "elderly", "debt"];
  const topFlag = priority.find(p => flags.includes(p)) || flags[0];
  const org = orgMap[topFlag];

  if (!org) return standardFooter;

  return `
    <p style="margin:0 0 6px 0;font-family:Calibri,Arial,sans-serif;font-size:13px;color:#1a1a1a;mso-line-height-rule:exactly;line-height:1.6;">
      ${org.intro}
    </p>
    <p style="margin:0 0 10px 0;font-family:Calibri,Arial,sans-serif;font-size:13px;color:#1a1a1a;mso-line-height-rule:exactly;line-height:1.6;">
      <strong>${org.name}</strong><br>
      Web: <a href="https://${org.web}" style="color:#1155cc;text-decoration:underline;">${org.web}</a> &nbsp;·&nbsp; Phone: <strong>${org.phone}</strong>
    </p>
    ${standardFooter}`;
}

function buildFinalHTML({ name, agent, accountBlock, paymentBlock, d, settlement, line, para }) {
  return `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="UTF-8">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:20px 32px 32px 32px;">

  ${para(`Dear ${name},`)}
  ${accountBlock}
  ${line}
  ${para(d.where_things_stand.replace(/\n/g,"<br>"))}
  ${para(d.what_you_need_to_do.replace(/\n/g,"<br>"))}
  ${settlement ? para(settlement.replace(/\n/g,"<br>")) : ""}
  ${line}
  ${paymentBlock}
  ${line}

  <p style="margin:0 0 6px 0;font-family:Calibri,Arial,sans-serif;font-size:14px;font-weight:bold;color:#1a1a1a;mso-line-height-rule:exactly;"><strong>Please note:</strong></p>
  <p style="margin:0 0 10px 0;font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55;mso-line-height-rule:exactly;"><strong>${d.important}</strong></p>

  <p style="margin:0 0 6px 0;font-family:Calibri,Arial,sans-serif;font-size:14px;font-weight:bold;color:#1a1a1a;mso-line-height-rule:exactly;"><strong>Acknowledgement:</strong></p>
  <p style="margin:0 0 10px 0;font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55;mso-line-height-rule:exactly;">${d.acknowledgement}</p>

  ${line}

  ${buildSupportHTML(d)}

  ${line}

  <p style="margin:0;font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1a1a1a;mso-line-height-rule:exactly;line-height:1.6;">
    Kind Regards,
  </p>
  <p style="margin:14px 0 0 0;font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1a1a1a;mso-line-height-rule:exactly;line-height:1.6;">
    <strong>${agent}</strong><br>
    Collections Agent<br>
    United Kash Limited<br>
    Tel: 01473 372212
  </p>

</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function buildPlainText(d, fields) {
  const isMult = d.multi_account;
  const agent = d.agent_name || "Collections Team";
  const name = d.customer_name || "Customer";
  const settlement = d.settlement_note || "";

  let accountLines = [];
  let paymentLines = [];

  if (isMult) {
    const r1 = fields.account1_ref || d.account1_ref || "[ACCOUNT REF 1]";
    const b1 = d.account1_balance ? (d.account1_balance.startsWith("£") ? d.account1_balance : `£${d.account1_balance}`) : "[BALANCE 1]";
    const p1 = (d.account1_pin && d.account1_pin !== "[PIN]") ? d.account1_pin : (fields.pin1 || "[PIN]");
    const r2 = fields.account2_ref || d.account2_ref || "[ACCOUNT REF 2]";
    const b2 = d.account2_balance ? (d.account2_balance.startsWith("£") ? d.account2_balance : `£${d.account2_balance}`) : "[BALANCE 2]";
    const p2 = (d.account2_pin && d.account2_pin !== "[PIN]") ? d.account2_pin : (fields.pin2 || "[PIN]");
    accountLines = [`ACCOUNT 1: ${r1} | Balance: ${b1} | PIN: ${p1}`, `ACCOUNT 2: ${r2} | Balance: ${b2} | PIN: ${p2}`];
    paymentLines = [
      `ACCOUNT 1 — ${r1}`, `Online Portal: ${PORTAL_URL}`, `Reference: ${r1} | PIN: ${p1}`,
      `Bank Transfer: United Kash Limited | Sort: 20-44-51 | Acc: 23385760 | Ref: ${r1}`, ``,
      `ACCOUNT 2 — ${r2}`, `Online Portal: ${PORTAL_URL}`, `Reference: ${r2} | PIN: ${p2}`,
      `Bank Transfer: United Kash Limited | Sort: 20-44-51 | Acc: 23385760 | Ref: ${r2}`, ``,
      `Live Chat: ${CHAT_URL}`,
    ];
  } else {
    const ref = fields.account1_ref || d.account_ref || "[ACCOUNT REF]";
    const bal = d.balance ? (d.balance.startsWith("£") ? d.balance : `£${d.balance}`) : "[BALANCE]";
    const p = (d.pin && d.pin !== "[PIN]") ? d.pin : (fields.pin1 || "[PIN]");
    accountLines = [`Account Reference: ${ref} | Outstanding Balance: ${bal}`];
    paymentLines = [
      `Online Portal: ${PORTAL_URL}`, `Account Reference: ${ref} | PIN: ${p}`, ``,
      `Live Chat: ${CHAT_URL}`, ``,
      `Bank Transfer: United Kash Limited | Sort: 20-44-51 | Acc: 23385760 | Ref: ${ref}`,
    ];
  }

  const supportLines = (() => {
    const flags = (d.vulnerability_flags || []).filter(f => f !== "none");
    const orgMap = {
      crisis:         { intro: "If you are in crisis or need someone to talk to, please contact:", name: "Samaritans", web: "samaritans.org", phone: "116 123 (free, 24/7)" },
      domestic_abuse: { intro: "If you are experiencing domestic abuse or financial control, confidential support is available:", name: "Refuge", web: "refuge.org.uk", phone: "0808 2000 247 (free, 24/7)" },
      mental_health:  { intro: "If you are struggling with your mental health, please reach out for support:", name: "Mind", web: "mind.org.uk", phone: "0300 123 3393" },
      gambling:       { intro: "If gambling is affecting your finances, free confidential help is available:", name: "GamCare", web: "gamcare.org.uk", phone: "0808 8020 133" },
      housing:        { intro: "If you are at risk of losing your home, please contact:", name: "Shelter", web: "shelter.org.uk", phone: "0808 800 4444" },
      elderly:        { intro: "If you need additional support managing your finances, Age UK can help:", name: "Age UK", web: "ageuk.org.uk", phone: "0800 678 1602" },
      debt:           { intro: "Free, impartial debt advice is available:", name: "StepChange Debt Charity", web: "stepchange.org", phone: "0800 138 1111" },
    };
    const priority = ["crisis","domestic_abuse","mental_health","gambling","housing","elderly","debt"];
    const top = priority.find(p => flags.includes(p));
    const org = top ? orgMap[top] : null;
    const lines = [];
    if (org) {
      lines.push(org.intro);
      lines.push(`${org.name}: ${org.web}  |  ${org.phone}`);
      lines.push("");
    }
    lines.push("If you are struggling financially, free support is also available:");
    lines.push(`MoneyHelper: www.moneyhelper.org.uk  |  0800 138 7777`);
    lines.push(`StepChange: stepchange.org  |  0800 138 1111`);
    return lines;
  })();

  return [
    `SUBJECT: ${d.subject}`, ``,
    `Dear ${name},`, ``,
    ...accountLines, ``,
    `─────────────────────`,
    d.where_things_stand, ``,
    d.what_you_need_to_do,
    settlement ? `\n${settlement}` : ``,
    ``, `─────────────────────`,
    `To make a payment, please use one of the following methods:`, ``,
    ...paymentLines, ``,
    `─────────────────────`,
    `Please note:`, d.important, ``,
    `Acknowledgement:`, d.acknowledgement, ``,
    `─────────────────────`,
    ...supportLines, ``,
    `─────────────────────`,
    `Kind Regards,`, ``,
    agent, `Collections Agent`, `United Kash Limited`, `Tel: 01473 372212`,
  ].join("\n");
}

async function copyRichText(html, plain) {
  try {
    if (window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      })]);
      return;
    }
  } catch (_) {}
  const div = document.createElement("div");
  div.innerHTML = html;
  div.style.cssText = "position:fixed;top:-9999px;left:-9999px;";
  document.body.appendChild(div);
  const sel = window.getSelection(), range = document.createRange();
  range.selectNodeContents(div);
  sel.removeAllRanges();
  sel.addRange(range);
  try { document.execCommand("copy"); } catch (_) {}
  sel.removeAllRanges();
  document.body.removeChild(div);
}

function EmailCard({ data, fields }) {
  const [open, setOpen] = useState({ where: true, what: true, settlement: !!data.settlement_note, payment: true, important: false, ack: false, support: false });
  const [copied, setCopied] = useState(false);
  const toggle = k => setOpen(p => ({ ...p, [k]: !p[k] }));
  const isMult = data.multi_account;

  const r1 = fields.account1_ref || data.account1_ref || data.account_ref || "[ACCOUNT REF]";
  const b1 = data.account1_balance || data.balance || "[BALANCE]";
  const p1 = (data.account1_pin && data.account1_pin !== "[PIN]") ? data.account1_pin : (fields.pin1 || data.pin || "[PIN]");
  const r2 = fields.account2_ref || data.account2_ref || "";
  const b2 = data.account2_balance || "";
  const p2 = (data.account2_pin && data.account2_pin !== "[PIN]") ? data.account2_pin : (fields.pin2 || "[PIN]");

  const handleCopy = async () => {
    await copyRichText(buildOutlookHTML(data, fields), buildPlainText(data, fields));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const Sec = ({ k, label, color = "#c9a84c", dot }) => (
    <button onClick={() => toggle(k)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: "7px 0", borderBottom: open[k] ? `1px solid ${color}28` : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        {dot && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: color, flexShrink: 0 }} />}
        <span style={{ fontSize: "10px", letterSpacing: "1.5px", color, textTransform: "uppercase", fontFamily: "inherit", fontWeight: "bold" }}>{label}</span>
      </div>
      <span style={{ color, fontSize: "11px" }}>{open[k] ? "▾" : "▸"}</span>
    </button>
  );

  const fmt = (v) => v ? (v.startsWith("£") ? v : `£${v}`) : "[BALANCE]";

  return (
    <div style={{ background: "#0c1420", border: "1px solid #c9a84c55", borderRadius: "8px", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: "#c9a84c12", borderBottom: "1px solid #c9a84c33", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: "bold", color: "#e8e4d9", marginBottom: "4px" }}>SUBJECT: {data.subject}</div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {["CONC 7 ✓", "Consumer Duty ✓", "CSA ✓", isMult ? "Dual Account ✓" : "Outlook ✓"].map(b => (
              <span key={b} style={{ fontSize: "9px", padding: "1px 6px", background: "#50a06418", border: "1px solid #50a06445", color: "#80c490", borderRadius: "2px" }}>{b}</span>
            ))}
          </div>
        </div>
        <button onClick={handleCopy} style={{ padding: "8px 20px", borderRadius: "4px", cursor: "pointer", fontFamily: "inherit", fontSize: "12px", fontWeight: "bold", border: "none", minWidth: "150px", background: copied ? "linear-gradient(135deg,#2d8a50,#25703f)" : "linear-gradient(135deg,#c9a84c,#e8c96a)", color: "#fff", transition: "all 0.2s" }}>
          {copied ? "✓ Copied — Paste in Outlook" : "📋 Copy to Outlook"}
        </button>
      </div>

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "2px", fontFamily: "'Courier New',monospace", fontSize: "12px", lineHeight: "1.75" }}>
        {/* Greeting */}
        <div style={{ color: "#d4cfc5", marginBottom: "10px" }}>Dear {data.customer_name || "Customer"},</div>

        {/* Account summary */}
        {isMult ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
            {[
              { label: "Account 1", ref: r1, bal: fmt(b1), pin: p1, color: "#1a2744" },
              { label: "Account 2", ref: r2, bal: fmt(b2), pin: p2, color: "#c9a84c" },
            ].map(({ label, ref, bal, pin, color }) => (
              <div key={label} style={{ background: "#0d1a28", borderLeft: `3px solid ${color}`, borderRight: "1px solid #1e3a55", borderTop: "1px solid #1e3a55", borderBottom: "1px solid #1e3a55", padding: "8px 12px" }}>
                <div style={{ fontSize: "9px", color, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>{label}</div>
                <div style={{ color: "#7aade0", fontSize: "11px" }}>Ref: <strong style={{ color: "#b8d4f0" }}>{ref}</strong></div>
                <div style={{ color: "#7aade0", fontSize: "11px" }}>Balance: <strong style={{ color: "#f87171" }}>{bal}</strong></div>
                <div style={{ color: "#7aade0", fontSize: "11px" }}>PIN: <strong style={{ color: "#b8d4f0" }}>{pin}</strong></div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: "#0d1a28", border: "1px solid #1e3a55", borderRadius: "4px", padding: "8px 12px", display: "inline-flex", gap: "24px", marginBottom: "10px" }}>
            <div><div style={{ fontSize: "9px", color: "#5a7a9a", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "2px" }}>Account Ref</div><div style={{ color: "#b8d4f0", fontWeight: "bold" }}>{r1}</div></div>
            <div><div style={{ fontSize: "9px", color: "#5a7a9a", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "2px" }}>Balance</div><div style={{ color: "#f87171", fontWeight: "bold" }}>{fmt(b1)}</div></div>
            <div><div style={{ fontSize: "9px", color: "#5a7a9a", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "2px" }}>PIN</div><div style={{ color: "#b8d4f0", fontWeight: "bold" }}>{p1}</div></div>
          </div>
        )}

        {[
          { k: "where", label: "Where Things Stand", body: data.where_things_stand },
          { k: "what", label: "What You Need To Do", body: data.what_you_need_to_do },
          ...(data.settlement_note ? [{ k: "settlement", label: "Settlement Terms", body: data.settlement_note, color: "#8ab4e0" }] : []),
        ].map(({ k, label, body, color }) => (
          <div key={k} style={{ borderTop: "1px solid #1a2a3a", paddingTop: "6px" }}>
            <Sec k={k} label={label} color={color} />
            {open[k] && <div style={{ color: "#c8c4ba", paddingTop: "6px", paddingBottom: "4px", whiteSpace: "pre-line" }}>{body}</div>}
          </div>
        ))}

        <div style={{ borderTop: "1px solid #1a2a3a", paddingTop: "6px" }}>
          <Sec k="payment" label="Payment Options" color="#7ac9a0" />
          {open.payment && (
            <div style={{ paddingTop: "8px", paddingBottom: "4px", fontSize: "11px", color: "#c8c4ba" }}>
              {isMult ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {[{ label: "Account 1", ref: r1, pin: p1, color: "#1a2744" }, { label: "Account 2", ref: r2, pin: p2, color: "#c9a84c" }].map(({ label, ref, pin, color }) => (
                    <div key={label} style={{ background: "#0d1a20", borderTop: `2px solid ${color}`, padding: "8px 10px" }}>
                      <div style={{ fontSize: "9px", color, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "5px", fontWeight: "bold" }}>{label}</div>
                      <div style={{ marginBottom: "4px" }}>Portal: <a href={PORTAL_URL} target="_blank" rel="noreferrer" style={{ color: "#60aeff" }}>{PORTAL_URL}</a></div>
                      <div>Ref: <strong style={{ color: "#b8d4f0" }}>{ref}</strong> · PIN: <strong style={{ color: "#b8d4f0" }}>{pin}</strong></div>
                      <div style={{ marginTop: "5px", color: "#7aade0" }}>Bank: 20-44-51 / 23385760 · Ref: <strong style={{ color: "#b8d4f0" }}>{ref}</strong></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div>Portal: <a href={PORTAL_URL} target="_blank" rel="noreferrer" style={{ color: "#60aeff" }}>{PORTAL_URL}</a> · Ref: <strong style={{ color: "#b8d4f0" }}>{r1}</strong> · PIN: <strong style={{ color: "#b8d4f0" }}>{p1}</strong></div>
                  <div>Live Chat: <a href={CHAT_URL} target="_blank" rel="noreferrer" style={{ color: "#60aeff" }}>{CHAT_URL}</a></div>
                  <div style={{ color: "#7aade0" }}>Bank Transfer: 20-44-51 / 23385760 · Ref: <strong style={{ color: "#b8d4f0" }}>{r1}</strong></div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid #1a2a3a", paddingTop: "6px" }}>
          <Sec k="important" label="Please Note" color="#d97706" dot />
          {open.important && <div style={{ background: "#1c1508", borderLeft: "3px solid #d97706", padding: "9px 12px", color: "#d4b87a", marginTop: "6px", fontSize: "12px", whiteSpace: "pre-line", fontWeight: "bold" }}>{data.important}</div>}
        </div>
        <div style={{ borderTop: "1px solid #1a2a3a", paddingTop: "6px" }}>
          <Sec k="ack" label="Acknowledgement" color="#b91c1c" dot />
          {open.ack && <div style={{ background: "#180a0a", borderLeft: "3px solid #b91c1c", padding: "9px 12px", color: "#d4a0a0", marginTop: "6px", fontSize: "12px", whiteSpace: "pre-line" }}>{data.acknowledgement}</div>}
        </div>
        <div style={{ borderTop: "1px solid #1a2a3a", paddingTop: "6px" }}>
          <Sec k="support" label={`Support Resources${(data.vulnerability_flags||[]).filter(f=>f!=="none").length > 0 ? " ⚠" : ""}`} color={(data.vulnerability_flags||[]).filter(f=>f!=="none").length > 0 ? "#e06060" : "#7a70b0"} />
          {open.support && (() => {
            const flags = (data.vulnerability_flags||[]).filter(f=>f!=="none");
            const orgMap = {
              crisis:         { intro: "Crisis support:", name: "Samaritans", web: "samaritans.org", phone: "116 123 (free, 24/7)" },
              domestic_abuse: { intro: "Domestic abuse support:", name: "Refuge", web: "refuge.org.uk", phone: "0808 2000 247" },
              mental_health:  { intro: "Mental health support:", name: "Mind", web: "mind.org.uk", phone: "0300 123 3393" },
              gambling:       { intro: "Gambling support:", name: "GamCare", web: "gamcare.org.uk", phone: "0808 8020 133" },
              housing:        { intro: "Housing support:", name: "Shelter", web: "shelter.org.uk", phone: "0808 800 4444" },
              elderly:        { intro: "Support for older customers:", name: "Age UK", web: "ageuk.org.uk", phone: "0800 678 1602" },
              debt:           { intro: "Debt advice:", name: "StepChange", web: "stepchange.org", phone: "0800 138 1111" },
            };
            const priority = ["crisis","domestic_abuse","mental_health","gambling","housing","elderly","debt"];
            const top = priority.find(p => flags.includes(p));
            const org = top ? orgMap[top] : null;
            return (
              <div style={{ paddingTop: "6px", fontSize: "11px", display: "flex", flexDirection: "column", gap: "5px" }}>
                {org && (
                  <div style={{ background: "#1a0d1a", borderLeft: "3px solid #e06060", padding: "8px 10px", borderRadius: "0 3px 3px 0" }}>
                    <div style={{ fontSize: "9px", color: "#e06060", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Vulnerability: {top?.replace("_"," ")}</div>
                    <div style={{ color: "#c8c4ba", fontWeight: "bold", marginBottom: "2px" }}>{org.name}</div>
                    <div style={{ color: "#9a90d4" }}>{org.web} · {org.phone}</div>
                  </div>
                )}
                <div style={{ color: "#7a70b0", lineHeight: "1.7" }}>
                  <strong style={{ color: "#c8c4ba" }}>MoneyHelper</strong> — <a href="https://www.moneyhelper.org.uk" target="_blank" rel="noreferrer" style={{ color: "#9a90d4" }}>moneyhelper.org.uk</a> · 0800 138 7777
                </div>
                <div style={{ color: "#7a70b0" }}>
                  <strong style={{ color: "#c8c4ba" }}>StepChange</strong> — <a href="https://www.stepchange.org" target="_blank" rel="noreferrer" style={{ color: "#9a90d4" }}>stepchange.org</a> · 0800 138 1111
                </div>
              </div>
            );
          })()}
        </div>
        <div style={{ borderTop: "1px solid #1a2a3a", paddingTop: "8px", color: "#7a8aa0", fontSize: "12px", lineHeight: "1.9" }}>
          Kind Regards,<br /><br />
          <span style={{ color: "#c8c4ba", fontWeight: "bold" }}>{data.agent_name || "Collections Team"}</span><br />
          Collections Agent<br />United Kash Limited<br />Tel: 01473 372212
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    if (!name.trim() || name.trim().length < 2) { setError("Please enter your full first name."); return; }
    onLogin(name.trim());
  };

  return (
    <div style={{ fontFamily: "'Georgia','Times New Roman',serif", background: "#0d1117", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: "420px", padding: "0 20px" }}>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div style={{ width: "56px", height: "56px", background: "linear-gradient(135deg,#c9a84c,#e8c96a)", borderRadius: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", color: "#0d1117", fontSize: "20px", marginBottom: "14px" }}>UK</div>
          <div style={{ fontSize: "20px", fontWeight: "bold", color: "#e8e4d9" }}>United Kash Limited</div>
          <div style={{ fontSize: "11px", color: "#c9a84c", letterSpacing: "2px", textTransform: "uppercase", marginTop: "4px" }}>Collections Email Agent</div>
        </div>
        <div style={{ background: "#111827", border: "1px solid #c9a84c44", borderRadius: "8px", padding: "32px 28px" }}>
          <div style={{ fontSize: "16px", fontWeight: "bold", color: "#e8e4d9", marginBottom: "6px" }}>Sign In</div>
          <div style={{ fontSize: "12px", color: "#5a7a9a", marginBottom: "24px" }}>Enter your name to set your signature for all emails you send.</div>
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "10px", color: "#c9a84c", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "7px" }}>Your Full Name</label>
            <input value={name} onChange={e => { setName(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="e.g. Sarah Mitchell" autoFocus style={{ width: "100%", padding: "11px 14px", background: "#0d1420", border: "1px solid #2a3a55", borderRadius: "5px", color: "#e8e4d9", fontSize: "15px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            {error && <div style={{ color: "#e06060", fontSize: "12px", marginTop: "6px" }}>{error}</div>}
          </div>
          {name.trim() && (
            <div style={{ background: "#0d1a28", border: "1px solid #1e3a55", borderRadius: "4px", padding: "12px 14px", marginBottom: "20px" }}>
              <div style={{ fontSize: "9px", color: "#5a7a9a", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>Signature Preview</div>
              <div style={{ fontFamily: "Calibri,Arial,sans-serif", fontSize: "13px", color: "#c8c4ba", lineHeight: "1.8" }}>
                Kind Regards,<br /><br /><strong style={{ color: "#e8e4d9" }}>{name.trim()}</strong><br />Collections Agent<br />United Kash Limited<br />Tel: 01473 372212
              </div>
            </div>
          )}
          <button onClick={handleLogin} style={{ width: "100%", padding: "13px", background: "linear-gradient(135deg,#c9a84c,#e8c96a)", color: "#0d1117", border: "none", borderRadius: "5px", fontSize: "14px", fontWeight: "bold", cursor: "pointer", fontFamily: "inherit" }}>Start Session →</button>
        </div>
        <div style={{ textAlign: "center", marginTop: "16px", fontSize: "10px", color: "#3a4a5a" }}>FCA CONC · CONSUMER DUTY FG22/5 · CSA COMPLIANT</div>
      </div>
    </div>
  );
}

export default function UKChatAgent() {
  const [agentName, setAgentName] = useState(() => { try { return localStorage.getItem("uk_agent_name") || ""; } catch { return ""; } });
  const [loggedIn, setLoggedIn] = useState(() => { try { return !!localStorage.getItem("uk_agent_name"); } catch { return false; } });

  const handleLogin = (name) => {
    try { localStorage.setItem("uk_agent_name", name); } catch {}
    setAgentName(name); setLoggedIn(true);
  };
  const handleLogout = () => {
    try { localStorage.removeItem("uk_agent_name"); } catch {}
    setAgentName(""); setLoggedIn(false);
  };

  if (!loggedIn) return <LoginScreen onLogin={handleLogin} />;
  return <ChatApp agentName={agentName} onLogout={handleLogout} />;
}

function ChatApp({ agentName, onLogout }) {
  const [messages, setMessages] = useState([{ role: "assistant", type: "text", content: `Welcome, ${agentName}. Paste a customer email, type your instruction, and hit Send.\n\nExamples:\n• "Broken arrangement — push for today"\n• "Customer has two accounts — address both"\n• "Settlement — accept 75%, flag credit file"\n• "Vulnerability flagged — be empathetic"` }]);
  const [customerEmail, setCustomerEmail] = useState("");
  const [instruction, setInstruction] = useState("");
  const [account1Ref, setAccount1Ref] = useState("");
  const [account2Ref, setAccount2Ref] = useState("");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(null);
  const bottomRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => {
    if (loading) { setTimer(0); timerRef.current = setInterval(() => setTimer(t => parseFloat((t + 0.1).toFixed(1))), 100); }
    else { clearInterval(timerRef.current); setTimer(null); }
    return () => clearInterval(timerRef.current);
  }, [loading]);

  const getFields = () => ({ account1_ref: account1Ref, account2_ref: account2Ref, pin1, pin2 });

  const send = async () => {
    if (!instruction.trim() && !customerEmail.trim()) return;
    const parts = [];
    if (customerEmail.trim()) parts.push(`CUSTOMER EMAIL:\n"""\n${customerEmail.trim()}\n"""`);
    if (account1Ref.trim()) parts.push(`Account 1 Reference: ${account1Ref.trim()}`);
    if (account2Ref.trim()) parts.push(`Account 2 Reference: ${account2Ref.trim()}`);
    if (pin1.trim()) parts.push(`Account 1 PIN: ${pin1.trim()}`);
    if (pin2.trim()) parts.push(`Account 2 PIN: ${pin2.trim()}`);
    if (agentName.trim()) parts.push(`Agent name for sign-off: ${agentName.trim()}`);
    parts.push(`INSTRUCTION: ${instruction.trim() || "Draft a professional reply."}`);
    const full = parts.join("\n\n");
    const userMsg = { role: "user", type: "text", content: instruction.trim() || "Draft reply", _full: full };
    setMessages(p => [...p, userMsg]);
    setInstruction("");
    setLoading(true);

    const apiMsgs = [...messages, userMsg].filter(m => m.role === "user" || m.role === "assistant").map(m => ({
      role: m.role,
      content: m.role === "user" ? (m._full || m.content) : m.type === "email" ? JSON.stringify(m.emailData) : m.content,
    }));

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, system: SYSTEM_PROMPT, messages: apiMsgs }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(`API Error: ${data.error.message}`);

      // Robust JSON extraction — strip any markdown, find the JSON object
      let raw = data.content?.map(b => b.text || "").join("").trim() || "";
      raw = raw.replace(/```json/g, "").replace(/```/g, "").trim();

      // Find first { and last } to extract just the JSON object
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("No JSON found in response");
      raw = raw.slice(start, end + 1);

      const parsed = JSON.parse(raw);
      if (agentName.trim()) parsed.agent_name = agentName.trim();
      setMessages(p => [...p, { role: "assistant", type: "email", emailData: parsed, fields: getFields() }]);
    } catch (e) {
      setMessages(p => [...p, { role: "assistant", type: "text", content: `⚠️ ${e.message || "Something went wrong. Please try again."}` }]);
    } finally { setLoading(false); }
  };

  const hasTwo = account2Ref.trim() || pin2.trim();

  return (
    <div style={{ fontFamily: "'Georgia','Times New Roman',serif", background: "#0d1117", minHeight: "100vh", display: "flex", flexDirection: "column", color: "#e2ddd5" }}>
      <div style={{ background: "linear-gradient(90deg,#111827,#161f30)", borderBottom: "1px solid #c9a84c55", padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "30px", height: "30px", background: "linear-gradient(135deg,#c9a84c,#e8c96a)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", color: "#0d1117", fontSize: "12px", flexShrink: 0 }}>UK</div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "bold", color: "#e8e4d9" }}>United Kash — Collections Email Agent</div>
            <div style={{ fontSize: "9px", color: "#c9a84c", letterSpacing: "1.5px" }}>FCA CONC · CONSUMER DUTY · CSA · OUTLOOK PROFESSIONAL</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#50c070", animation: "glow 2s ease-in-out infinite" }} />
            <span style={{ fontSize: "11px", color: "#c8c4ba" }}>{agentName}</span>
          </div>
          <button onClick={onLogout} style={{ background: "transparent", border: "1px solid #2a3a55", color: "#5a7a9a", padding: "4px 10px", borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>Sign Out</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-start" }}>
            {msg.role === "assistant" && <div style={{ width: "24px", height: "24px", flexShrink: 0, background: "linear-gradient(135deg,#c9a84c,#e8c96a)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: "bold", color: "#0d1117", marginTop: "3px" }}>UK</div>}
            <div style={{ maxWidth: msg.type === "email" ? "92%" : "74%", width: msg.type === "email" ? "100%" : undefined }}>
              {msg.type === "email"
                ? <EmailCard data={msg.emailData} fields={msg.fields || getFields()} />
                : <div style={{ padding: "9px 13px", borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "4px 14px 14px 14px", background: msg.role === "user" ? "linear-gradient(135deg,#1e3a5f,#1a3050)" : "#161f2e", border: msg.role === "user" ? "1px solid #2a4a7f" : "1px solid #ffffff11", fontSize: "12.5px", lineHeight: "1.7", color: msg.role === "user" ? "#b8d4f0" : "#c8c4ba", whiteSpace: "pre-wrap" }}>{msg.content}</div>}
            </div>
            {msg.role === "user" && <div style={{ width: "24px", height: "24px", flexShrink: 0, background: "#1e3a5f", border: "1px solid #2a4a7f", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", color: "#7aa8d0", marginTop: "3px" }}>ME</div>}
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{ width: "24px", height: "24px", background: "linear-gradient(135deg,#c9a84c,#e8c96a)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: "bold", color: "#0d1117" }}>UK</div>
            <div style={{ padding: "9px 14px", background: "#161f2e", border: "1px solid #ffffff11", borderRadius: "4px 14px 14px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
              {[0,1,2].map(j => <div key={j} style={{ width: "6px", height: "6px", background: "#c9a84c", borderRadius: "50%", animation: "blink 1s ease-in-out infinite", animationDelay: `${j*0.2}s` }} />)}
              <span style={{ fontSize: "11px", color: "#c9a84c88", fontFamily: "monospace" }}>{timer !== null ? `${timer}s` : ""}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ background: "#111827", borderTop: "1px solid #c9a84c44", padding: "12px 14px", flexShrink: 0 }}>
        {/* Account fields */}
        <div style={{ marginBottom: "8px" }}>
          <div style={{ display: "flex", gap: "7px", marginBottom: "6px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "9px", color: "#c9a84c", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "3px" }}>Account 1 Ref</div>
              <input value={account1Ref} onChange={e => setAccount1Ref(e.target.value)} placeholder="e.g. U191887" style={inSm} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "9px", color: pin1 ? "#50c070" : "#e06060", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "3px" }}>Account 1 PIN {pin1 ? "✓" : "⚠"}</div>
              <input value={pin1} onChange={e => setPin1(e.target.value)} placeholder="e.g. 4892" style={{ ...inSm, border: pin1 ? "1px solid #2a3a55" : "1px solid #e0606066", background: pin1 ? "#0d1420" : "#1a0d0d" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "9px", color: "#5a7a9a", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "3px" }}>Account 2 Ref <span style={{ color: "#3a5a7a" }}>(if applicable)</span></div>
              <input value={account2Ref} onChange={e => setAccount2Ref(e.target.value)} placeholder="e.g. U205441" style={{ ...inSm, opacity: 0.8 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "9px", color: "#5a7a9a", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "3px" }}>Account 2 PIN <span style={{ color: "#3a5a7a" }}>(if applicable)</span></div>
              <input value={pin2} onChange={e => setPin2(e.target.value)} placeholder="e.g. 7731" style={{ ...inSm, opacity: 0.8 }} />
            </div>
          </div>
          {hasTwo && <div style={{ fontSize: "10px", color: "#c9a84c", marginTop: "4px" }}>✓ Dual account mode active — email will cover both accounts</div>}
        </div>

        <button onClick={() => setShowDetails(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "#5a7a9a", fontSize: "11px", fontFamily: "inherit", padding: "0 0 7px 0", display: "flex", alignItems: "center", gap: "5px" }}>
          <span>{showDetails ? "▾" : "▸"}</span> {showDetails ? "Hide" : "Paste"} customer email
        </button>
        {showDetails && (
          <textarea value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="Paste the customer's email here — AI will extract names, refs, balances and PINs automatically..." style={{ width: "100%", padding: "8px 11px", background: "#0d1420", border: "1px solid #2a3a55", borderRadius: "4px", color: "#90b0cc", fontSize: "12px", fontFamily: "'Courier New',monospace", lineHeight: "1.6", resize: "vertical", minHeight: "80px", boxSizing: "border-box", outline: "none", marginBottom: "8px" }} />
        )}

        {/* Quick action chips */}
        <div style={{ marginBottom: "8px" }}>
          <div style={{ fontSize: "9px", color: "#5a7a9a", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "5px" }}>Quick Actions — tap to add to instruction</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {[
              { label: "⚠ Broken Arrangement", text: "Broken arrangement — push for payment today" },
              { label: "✓ Payment Received", text: "Payment received — confirm and advise next steps" },
              { label: "📅 Promise to Pay", text: "Customer promised to pay — confirm date and push for today" },
              { label: "📵 No Contact", text: "Customer not responding — firm tone, urge immediate contact" },
              { label: "💰 Settlement 75%", text: "Settlement offer — accept 75%, mention partially satisfied credit file, bank transfer 2-3 days clearance" },
              { label: "📋 I&E Required", text: "Plan under £20/month — request income and expenditure form before confirming arrangement" },
              { label: "🪙 Token £5", text: "Token payment of £5 received — acknowledge as holding position, push for full arrangement today" },
              { label: "🪙 Token £10-£20", text: "Token payment received — acknowledge engagement, push for sustainable full arrangement" },
              { label: "⚡ Vulnerability", text: "Vulnerability flagged — increase empathy significantly, reduce pressure, prioritise support signposting" },
              { label: "👋 First Contact", text: "First contact — introduce the account professionally, explain purpose, invite engagement" },
              { label: "🏦 Both Accounts", text: "Customer has two accounts — address both accounts individually in the response" },
            ].map(({ label, text }) => (
              <button key={label} onClick={() => setInstruction(prev => prev ? prev + "\n" + text : text)} style={{ padding: "4px 10px", background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.25)", color: "#c9a84c", borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", transition: "all 0.15s" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
          <textarea
            value={instruction}
            onChange={e => {
              setInstruction(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
            }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={"Type your instruction or tap a Quick Action above...\n\nExamples:\n• Broken arrangement — push for today\n• Customer has two accounts, address both\n• Settlement 75%, flag credit file\n• Vulnerability flagged — be empathetic"}
            rows={5}
            style={{ flex: 1, padding: "12px 14px", background: "#161f2e", border: "1px solid #2a4a7f", borderRadius: "8px", color: "#e2ddd5", fontSize: "14px", fontFamily: "inherit", lineHeight: "1.6", resize: "none", minHeight: "110px", maxHeight: "200px", outline: "none", boxSizing: "border-box", overflowY: "auto" }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
            <button onClick={send} disabled={loading || (!instruction.trim() && !customerEmail.trim())} style={{ padding: "14px 20px", background: loading ? "#c9a84c44" : "linear-gradient(135deg,#c9a84c,#e8c96a)", color: loading ? "#8a7a50" : "#0d1117", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "bold", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", minWidth: "90px" }}>
              {loading ? `${timer}s` : "Send →"}
            </button>
            <button onClick={() => { setAccount1Ref(""); setAccount2Ref(""); setPin1(""); setPin2(""); setCustomerEmail(""); setInstruction(""); setShowDetails(false); }} style={{ padding: "8px 10px", background: "transparent", border: "1px solid #2a3a55", color: "#5a7a9a", borderRadius: "6px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
              New Customer
            </button>
          </div>
        </div>
        <div style={{ fontSize: "10px", color: "#3a4a5a", marginTop: "5px" }}>Enter to send · Shift+Enter new line · "New Customer" clears all fields for next customer</div>
      </div>

      <style>{`
        @keyframes blink{0%,100%{opacity:0.2;transform:scale(0.8)}50%{opacity:1;transform:scale(1.1)}}
        @keyframes glow{0%,100%{box-shadow:0 0 4px #50c07066}50%{box-shadow:0 0 10px #50c070cc}}
        textarea:focus,input:focus{border-color:#c9a84c88!important}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#0d1117}::-webkit-scrollbar-thumb{background:#2a3a55;border-radius:3px}
      `}</style>
    </div>
  );
}
const inSm = { flex: 1, padding: "7px 10px", background: "#0d1420", border: "1px solid #2a3a55", borderRadius: "4px", color: "#b8d4f0", fontSize: "12px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
