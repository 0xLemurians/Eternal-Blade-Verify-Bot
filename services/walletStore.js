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
      This prevents two simultaneously opened modals from
      racing on the per-user primary key.
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
            wallet_address_normalized,
            eligibility_role_id,
            eligibility_role_name,
            submitted_at,
            updated_at
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

    const duplicateResult =
      await connection.query(
        `
          SELECT discord_user_id
          FROM wallet_submissions
          WHERE guild_id = $1
            AND wallet_address_normalized = $2
            AND discord_user_id <> $3
          LIMIT 1
        `,
        [
          guildId,
          normalizedWalletAddress,
          userId
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

    const existing =
      existingResult.rows[0] ||
      null;

    if (!existing) {
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
    }

    const addressChanged =
      existing.wallet_address_normalized !==
        normalizedWalletAddress;

    const roleChanged =
      existing.eligibility_role_id !==
        eligibilityRoleId;

    const updateResult =
      await connection.query(
        `
          UPDATE wallet_submissions
          SET
            discord_username = $3,
            discord_display_name = $4,
            wallet_address = $5,
            wallet_address_normalized = $6,
            chain = $7,
            eligibility_role_id = $8,
            eligibility_role_name = $9,
            updated_at = NOW()
          WHERE guild_id = $1
            AND discord_user_id = $2
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
        addressChanged || roleChanged
          ? "updated"
          : "unchanged",
      addressChanged,
      roleChanged,
      previousAddress:
        existing.wallet_address,
      previousEligibilityRoleId:
        existing.eligibility_role_id,
      previousEligibilityRoleName:
        existing.eligibility_role_name,
      submittedAt:
        updateResult.rows[0]
          .submitted_at,
      updatedAt:
        updateResult.rows[0]
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
