// ==================================================
// WALLET COLLECTION CONFIGURATION
// ==================================================

export const WALLET_SUBMISSION_CHANNEL_ID =
  "1550988251081211935";

export const WALLET_LOGS_CHANNEL_ID =
  "1550988980554694727";

export const WALLET_PANEL_MESSAGE_ID =
  process.env.WALLET_PANEL_MESSAGE_ID
    ?.trim() || "";

export const WALLET_PANEL_TITLE =
  "ETERNAL BLADES — WALLET SUBMISSION";

export const WALLET_CUSTOM_IDS = {
  submitButton:
    "wallet_submit",
  submitModal:
    "wallet_submit_modal",
  addressInput:
    "wallet_address"
};

/*
  Order matters. If a member has more than one eligible
  role, the first matching role becomes the eligibility
  snapshot stored with the submission.

  Blade Seeker is intentionally NOT included.
*/
export const WALLET_ELIGIBLE_ROLES = [
  {
    id:
      "1532166665482276964",
    name:
      "Legend of the Blades"
  },
  {
    id:
      "1506664105459585115",
    name:
      "Blade Warden"
  },
  {
    id:
      "1506660264584679584",
    name:
      "Blade Vanguard"
  },
  {
    id:
      "1531702413545963651",
    name:
      "First Blades"
  }
];

export const WALLET_CHAIN = {
  key:
    "ethereum",
  label:
    "Ethereum / EVM"
};
