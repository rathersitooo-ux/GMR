export const SHOP_FORMAL_CATALOG_SCHEMA = 'gameroad.shop-formal-catalog.v1';

const SAASUNA_SLEEVE_ART_SHA256 = '392309e2fe04e1096b2caf19bed072fe57db2895d369dda1f7488c0fd3e322c6';
const SAASUNA_SLEEVE_IMAGE_URL = '../assets/shop/fanart/saasuna-sleeve-snow-blue-v1.jpg';

export const SAASUNA_FANART_SLEEVE_WORK = Object.freeze({
  workId:'FANART-SAASUNA-SLEEVE-SNOW-BLUE-001',
  workVersion:'v1',
  title:'サースナー用ファンアートスリーブ',
  creatorDisplayName:'ユーザー提供',
  creatorUserId:'user-provided-attachment',
  submissionRecordId:'user-attachment:' + SAASUNA_SLEEVE_ART_SHA256,
  approvalRecordId:'user-direct:shop-sleeve:20260921T1209',
  targetUseSite:'CARD_SLEEVE',
  targetPartnerId:'partner.saasuna',
  imageAssetId:'asset:sha256:' + SAASUNA_SLEEVE_ART_SHA256,
  imageUrl:SAASUNA_SLEEVE_IMAGE_URL,
  formalApprovalState:'APPROVED',
  approvedBy:'HUMAN',
  imageReviewState:'APPROVED',
  gameUseApproved:true,
  shopUseApproved:true,
  acquisition:Object.freeze({
    state:'READY',
    productId:'fanart:saasuna-sleeve-snow-blue:v1',
    currency:'MANII',
    price:50,
  }),
});

export const APPROVED_FAN_ART_SHOP_WORKS = Object.freeze([
  SAASUNA_FANART_SLEEVE_WORK,
]);

// Supply is a supported formal kind in the Shop runtime. No supply product is
// invented here because the user did not provide a specific approved supply.
export const FORMAL_SHOP_CATALOG_ITEMS = Object.freeze([]);

export const SHOP_FORMAL_CATALOG = Object.freeze({
  schema:SHOP_FORMAL_CATALOG_SCHEMA,
  items:FORMAL_SHOP_CATALOG_ITEMS,
  approvedFanArtWorks:APPROVED_FAN_ART_SHOP_WORKS,
});
