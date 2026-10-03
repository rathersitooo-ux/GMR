var GAMEROAD_MANII_CURRENCY = "MANII";
var GAMEROAD_ONBOARDING_GRANT_ID = "account-onboarding-manii:v1";
var GAMEROAD_ONBOARDING_GRANT_AMOUNT = 100;
var GAMEROAD_ONBOARDING_COLLECTION = "gameroad_economy";
var GAMEROAD_ONBOARDING_KEY = "onboarding_manii_v1";
var GAMEROAD_BOOTSTRAP_RPC = "gameroad_bootstrap";

function gameroadGrantMarkerRead(nk, userId) {
  var objects = nk.storageRead([{
    collection: GAMEROAD_ONBOARDING_COLLECTION,
    key: GAMEROAD_ONBOARDING_KEY,
    userId: userId
  }]);
  return objects && objects.length > 0 ? objects[0] : null;
}

function gameroadEnsureInitialManiiGrant(ctx, logger, nk) {
  var userId = ctx && ctx.userId ? String(ctx.userId) : "";
  if (!userId) {
    throw new Error("authenticated user id required");
  }

  var existing = gameroadGrantMarkerRead(nk, userId);
  if (existing) {
    return {
      ok: true,
      granted: false,
      idempotent: true,
      grantId: GAMEROAD_ONBOARDING_GRANT_ID,
      amount: GAMEROAD_ONBOARDING_GRANT_AMOUNT
    };
  }

  var marker = {
    collection: GAMEROAD_ONBOARDING_COLLECTION,
    key: GAMEROAD_ONBOARDING_KEY,
    userId: userId,
    value: {
      grantId: GAMEROAD_ONBOARDING_GRANT_ID,
      amount: GAMEROAD_ONBOARDING_GRANT_AMOUNT
    },
    version: "*",
    permissionRead: 0,
    permissionWrite: 0
  };

  var walletUpdate = {
    userId: userId,
    changeset: {},
    metadata: {
      reason: "ACCOUNT_ONBOARDING",
      grantId: GAMEROAD_ONBOARDING_GRANT_ID
    }
  };
  walletUpdate.changeset[GAMEROAD_MANII_CURRENCY] = GAMEROAD_ONBOARDING_GRANT_AMOUNT;

  try {
    nk.multiUpdate(null, [marker], null, [walletUpdate], true);
    return {
      ok: true,
      granted: true,
      idempotent: false,
      grantId: GAMEROAD_ONBOARDING_GRANT_ID,
      amount: GAMEROAD_ONBOARDING_GRANT_AMOUNT
    };
  } catch (error) {
    // version:"*" is if-not-exists. If another login won the race, the atomic
    // transaction rolls back the duplicate wallet update and the marker now exists.
    var raced = gameroadGrantMarkerRead(nk, userId);
    if (raced) {
      return {
        ok: true,
        granted: false,
        idempotent: true,
        grantId: GAMEROAD_ONBOARDING_GRANT_ID,
        amount: GAMEROAD_ONBOARDING_GRANT_AMOUNT
      };
    }
    if (logger && logger.error) {
      logger.error("GAMEROAD onboarding MANII grant failed for user %s: %s", userId, String(error));
    }
    throw error;
  }
}

function gameroadAfterAuthenticate(ctx, logger, nk, out, input) {
  try {
    gameroadEnsureInitialManiiGrant(ctx, logger, nk);
  } catch (error) {
    // Authentication itself must remain usable during a transient reward failure.
    // The client bootstrap RPC retries the same atomic/idempotent grant immediately.
    if (logger && logger.error) {
      logger.error("GAMEROAD post-auth bootstrap deferred: %s", String(error));
    }
  }
}

function gameroadBootstrapRpc(ctx, logger, nk, payload) {
  var result = gameroadEnsureInitialManiiGrant(ctx, logger, nk);
  return JSON.stringify(result);
}

function InitModule(ctx, logger, nk, initializer) {
  initializer.registerRpc(GAMEROAD_BOOTSTRAP_RPC, gameroadBootstrapRpc);

  initializer.registerAfterAuthenticateDevice(gameroadAfterAuthenticate);
  initializer.registerAfterAuthenticateCustom(gameroadAfterAuthenticate);
  initializer.registerAfterAuthenticateEmail(gameroadAfterAuthenticate);
  initializer.registerAfterAuthenticateApple(gameroadAfterAuthenticate);
  initializer.registerAfterAuthenticateGoogle(gameroadAfterAuthenticate);
  initializer.registerAfterAuthenticateGameCenter(gameroadAfterAuthenticate);
  initializer.registerAfterAuthenticateSteam(gameroadAfterAuthenticate);
  initializer.registerAfterAuthenticateFacebook(gameroadAfterAuthenticate);
  initializer.registerAfterAuthenticateFacebookInstantGame(gameroadAfterAuthenticate);

  logger.info("GAMEROAD Nakama live-service account foundation loaded.");
}
