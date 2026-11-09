/**
 * ADDP Omnichannel AI CRM — Persistent Channels Store (WBS-11)
 * Re-exports persistent channel management functions from connectionHub.js
 * Lưu trữ bền vững tại `portal/.data/channels.json` (tắt hoàn toàn SEED_MOCK_CHANNELS).
 */

export {
  PLATFORM_INFO,
  encryptCredential,
  decryptCredential,
  listAllChannels,
  getChannelById,
  createChannelAccount,
  updateChannelAccount,
  deleteChannelAccount,
  testChannelHealth,
} from "./connectionHub.js";
