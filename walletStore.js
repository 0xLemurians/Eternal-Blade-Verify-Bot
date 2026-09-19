import pg from "pg";

const {
  Pool
} = pg;


let walletPool =
  null;

let walletStoreReady =
  false;


function getDatabaseUrl() {
  return process.env.DATABASE_URL
    ?.trim() || "";
}


function requireWalletPool() {
  if (
    !walletStoreReady ||
    !walletPool
  ) {
    throw new Error(
      "Wallet database is not ready. Check DATABASE_URL and Railway PostgreSQL."
    );
  }

  return walletPool;
}


export async function setupWalletStore() {
  if (walletStoreReady) {
    return;
  }

  const databaseUrl =
    getDatabaseUrl();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is missing or empty. Add a Railway PostgreSQL database before enabling wallet submissions."
    );
  }

  const pool =
    new Pool({
      connectionString:
        databaseUrl,
      max:
        5,
      idleTimeoutMillis:
        30_000,
      connectionTimeoutMillis:
        10_000
    });

  pool.on(
    "error",
    error => {
      console.error(
        "Wallet PostgreSQL pool error:",
        error
      );
    }
  );

  try {
    await pool.query(
      "SELECT 1"
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_submissions (
        guild_id VARCHAR(32) NOT NULL,
        discord_user_id VARCHAR(32) NOT NULL,
        discord_username TEXT NOT NULL,
        discord_display_name TEXT NOT NULL,
        wallet_address VARCHAR(42) NOT NULL,
        wallet_address_normalized VARCHAR(42) NOT NULL,
        chain VARCHAR(32) NOT NULL DEFAULT 'ethereum',
        eligibility_role_id VARCHAR(32) NOT NULL,
        eligibility_role_name TEXT NOT NULL,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, discord_user_id),
        CONSTRAINT wallet_submissions_wallet_unique
          UNIQUE (guild_id, wallet_address_normalized)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS wallet_submissions_updated_at_idx
      ON wallet_submissions (updated_at DESC)
    `);

    walletPool =
      pool;

    walletStoreReady =
      true;

    console.log(
      "Wallet PostgreSQL store is ready."
    );

  } catch (error) {
    await pool.end().catch(
      () => {}
    );

    throw error;
  }
}


export async function upsertWalletSubmission({
  guildId,
  userId,
  username,
  displayName,
  walletAddress,
  normalizedWalletAddress,
  chain,
  eligibilityRoleId,
  eligibilityRoleName
}) {
  const pool =
    requireWalletPool();

  const connection =
    await pool.connect();

  try {
    await connection.query(
      "BEGIN"
    );

    /*
      Serialize submissions from the same Discord user.
      Wallet submissions are intentionally one-time only.
      If two modals are submitted at nearly the same time,
      the second one waits, sees the first record and is rejected.
    */
    await connection.query(
      "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
      [
        `${guildId}:${userId}`
      ]
    );

    const existingResult =
      await connection.query(
        `
          SELECT
            wallet_address,
            submitted_at
          FROM wallet_submissions
          WHERE guild_id = $1
            AND discord_user_id = $2
          FOR UPDATE
        `,
        [
          guildId,
          userId
        ]
      );

    if (existingResult.rowCount > 0) {
      await connection.query(
        "ROLLBACK"
      );

      return {
        status:
          "already_submitted"
      };
    }

    const duplicateResult =
      await connection.query(
        `
          SELECT discord_user_id
          FROM wallet_submissions
          WHERE guild_id = $1
            AND wallet_address_normalized = $2
          LIMIT 1
        `,
        [
          guildId,
          normalizedWalletAddress
        ]
      );

    if (duplicateResult.rowCount > 0) {
      await connection.query(
        "ROLLBACK"
      );

      return {
        status:
          "duplicate"
      };
    }

    const insertResult =
      await connection.query(
        `
          INSERT INTO wallet_submissions (
            guild_id,
            discord_user_id,
            discord_username,
            discord_display_name,
            wallet_address,
            wallet_address_normalized,
            chain,
            eligibility_role_id,
            eligibility_role_name
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING submitted_at, updated_at
        `,
        [
          guildId,
          userId,
          username,
          displayName,
          walletAddress,
          normalizedWalletAddress,
          chain,
          eligibilityRoleId,
          eligibilityRoleName
        ]
      );

    await connection.query(
      "COMMIT"
    );

    return {
      status:
        "created",
      submittedAt:
        insertResult.rows[0]
          .submitted_at,
      updatedAt:
        insertResult.rows[0]
          .updated_at
    };

  } catch (error) {
    await connection.query(
      "ROLLBACK"
    ).catch(
      () => {}
    );

    if (
      error?.code === "23505" &&
      String(
        error?.constraint || ""
      ).includes(
        "wallet_submissions_wallet_unique"
      )
    ) {
      return {
        status:
          "duplicate"
      };
    }

    /*
      The per-user primary key is a second safety net for the
      one-submission-per-Discord-account rule.
    */
    if (
      error?.code === "23505" &&
      String(
        error?.constraint || ""
      ).includes(
        "wallet_submissions_pkey"
      )
    ) {
      return {
        status:
          "already_submitted"
      };
    }

    throw error;

  } finally {
    connection.release();
  }
}


export async function stopWalletStore() {
  const pool =
    walletPool;

  walletPool =
    null;

  walletStoreReady =
    false;

  if (!pool) {
    return;
  }

  await pool.end();

  console.log(
    "Wallet PostgreSQL store closed."
  );
}
