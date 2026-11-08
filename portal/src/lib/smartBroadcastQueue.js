import {
  getAllBroadcastCampaigns,
  createBroadcastCampaign as createEngineCampaign,
  controlBroadcastCampaign,
  spinAndPersonalizeText,
} from "./broadcastEngine.js";

/**
 * ADDP Omnichannel AI CRM — Smart Broadcast Queue Bridge (WBS-35)
 * Kết nối trực tiếp với `broadcastEngine.js`.
 */

export function personalizeAndParaphrase(template, recipient = {}) {
  return spinAndPersonalizeText(template, recipient);
}

export function getAllCampaigns() {
  return getAllBroadcastCampaigns();
}

export function createBroadcastCampaign(input) {
  return createEngineCampaign(input);
}

export function updateCampaignStatus(id, status) {
  return controlBroadcastCampaign(id, status);
}
