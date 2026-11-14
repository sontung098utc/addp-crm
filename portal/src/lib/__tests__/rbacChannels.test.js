import test from "node:test";
import assert from "node:assert/strict";
import {
  isChannelScopeRestricted,
  getAssignedChannelKeysSet,
  getChannelIdentifierKeys,
  isChannelAllowedForStaff,
  filterChannelsForStaff,
  isConversationAllowedForStaff,
  filterRecordsByRbac,
} from "../rbac.js";

const SAMPLE_CHANNELS = [
  {
    id: "zalo_111",
    platform: "ZALO_PERSONAL",
    externalId: "111",
    config: { ownId: "111" },
  },
  {
    id: "fb_222",
    platform: "FACEBOOK",
    externalId: "222",
    config: { pageId: "222" },
  },
  {
    id: "fb_333",
    platform: "FACEBOOK",
    externalId: "333",
    config: { pageId: "333" },
  },
  {
    id: "tiktok_444",
    platform: "TIKTOK_SHOP",
    externalId: "444",
    shopId: "444",
    config: { shopId: "444" },
  },
  {
    id: "shopee_555",
    platform: "SHOPEE",
    externalId: "555",
    shopId: "555",
    config: { shopId: "555" },
  },
  {
    id: "zalo_oa_666",
    platform: "ZALO_OA",
    externalId: "666",
    config: { oaId: "666" },
  },
];

const SAMPLE_CONVERSATIONS = [
  { id: "c1", channel: "ZALO_PERSONAL", accountOwnId: "111", accountId: "zalo_111" },
  { id: "c2", channel: "FACEBOOK", pageId: "222", accountId: "222" },
  { id: "c3", channel: "FACEBOOK", pageId: "333", accountId: "333" },
  { id: "c4", channel: "TIKTOK_SHOP", shopId: "444", accountId: "444" },
  { id: "c5", channel: "SHOPEE", shopId: "555", accountId: "555" },
  { id: "c6", channel: "ZALO_OA", accountId: "666" },
  { id: "c7", channel: "FACEBOOK" }, // No channel ID
];

test("ADMIN and unrestricted SALE_LEADER see all channels and conversations", () => {
  const admin = { id: 1, code: "ADMIN", role: "ADMIN", assignedChannels: [] };
  assert.equal(isChannelScopeRestricted(admin), false);
  assert.equal(filterChannelsForStaff(admin, SAMPLE_CHANNELS).length, 6);
  assert.equal(
    SAMPLE_CONVERSATIONS.filter((c) => isConversationAllowedForStaff(admin, c, SAMPLE_CHANNELS)).length,
    7
  );

  const leaderAll = {
    id: 2,
    code: "SL01",
    role: "SALE_LEADER",
    customerScope: "all",
    assignedChannels: [],
  };
  assert.equal(isChannelScopeRestricted(leaderAll), false);
  assert.equal(filterChannelsForStaff(leaderAll, SAMPLE_CHANNELS).length, 6);
});

test("SALE_LEADER with assignedChannels or assigned_only scope is restricted", () => {
  const leaderRestricted = {
    id: 2,
    code: "SL02",
    role: "SALE_LEADER",
    customerScope: "all",
    assignedChannels: ["222", "444"],
  };
  assert.equal(isChannelScopeRestricted(leaderRestricted), true);
  assert.deepEqual(
    filterChannelsForStaff(leaderRestricted, SAMPLE_CHANNELS).map((c) => c.id),
    ["fb_222", "tiktok_444"]
  );
});

test("SALE with 0 assignedChannels sees 0 channels and 0 conversations across all platforms", () => {
  const saleEmpty = { id: 3, code: "S001", role: "SALE", assignedChannels: [] };
  assert.equal(isChannelScopeRestricted(saleEmpty), true);
  assert.equal(getAssignedChannelKeysSet(saleEmpty).size, 0);
  assert.equal(filterChannelsForStaff(saleEmpty, SAMPLE_CHANNELS).length, 0);
  assert.equal(
    SAMPLE_CONVERSATIONS.filter((c) => isConversationAllowedForStaff(saleEmpty, c, SAMPLE_CHANNELS)).length,
    0
  );

  const cskhUndefined = { id: 4, code: "CS01", role: "CSKH" };
  assert.equal(isChannelScopeRestricted(cskhUndefined), true);
  assert.equal(filterChannelsForStaff(cskhUndefined, SAMPLE_CHANNELS).length, 0);
  assert.equal(
    SAMPLE_CONVERSATIONS.filter((c) => isConversationAllowedForStaff(cskhUndefined, c, SAMPLE_CHANNELS)).length,
    0
  );
});

test("SALE with specific assignedChannels only sees matching Zalo, Fanpage, TikTok, Shopee, Zalo OA", () => {
  const sale = {
    id: 5,
    code: "S002",
    role: "SALE",
    assignedChannels: ["111", "222", "444", "555", "666"],
  };
  const visibleChannels = filterChannelsForStaff(sale, SAMPLE_CHANNELS);
  assert.deepEqual(
    visibleChannels.map((c) => c.id),
    ["zalo_111", "fb_222", "tiktok_444", "shopee_555", "zalo_oa_666"]
  );
  assert.equal(isChannelAllowedForStaff(sale, SAMPLE_CHANNELS[2]), false); // fb_333 denied

  const visibleConvs = SAMPLE_CONVERSATIONS.filter((c) =>
    isConversationAllowedForStaff(sale, c, SAMPLE_CHANNELS)
  );
  assert.deepEqual(
    visibleConvs.map((c) => c.id),
    ["c1", "c2", "c4", "c5", "c6"]
  );
});

test("Cross-matching works when staff stores channel.id and conversation has external pageId/shopId", () => {
  const saleById = {
    id: 6,
    code: "S003",
    role: "SALE",
    assignedChannels: ["fb_333", "tiktok_444"],
  };
  assert.equal(
    isConversationAllowedForStaff(saleById, { id: "c3", channel: "FACEBOOK", pageId: "333" }, SAMPLE_CHANNELS),
    true
  );
  assert.equal(
    isConversationAllowedForStaff(saleById, { id: "c2", channel: "FACEBOOK", pageId: "222" }, SAMPLE_CHANNELS),
    false
  );
  assert.equal(getChannelIdentifierKeys(SAMPLE_CHANNELS[0]).includes("111"), true);
});

test("filterRecordsByRbac enforces strict conversation channel filtering for SALE", () => {
  const sale = { id: 7, code: "S004", role: "SALE", assignedChannels: ["222"] };
  const filtered = filterRecordsByRbac(sale, SAMPLE_CONVERSATIONS, "conversations");
  assert.deepEqual(
    filtered.map((c) => c.id),
    ["c2"]
  );
});
