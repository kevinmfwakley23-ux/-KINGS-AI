import {
  OwnerIdentityAuthority,
} from "./owner-identity";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

async function main(): Promise<void> {
  const authority =
    new OwnerIdentityAuthority({
      ownerEmail:
        "owner@example.invalid",
      displayName:
        "K.I.N.G.S. Owner",
      githubLogin:
        "kevinmfwakley23-ux",
    });

  const owner =
    authority.getOwner();

  assert(
    owner.provider ===
      "kings-email",
    "K.I.N.G.S. owner identity must be email-first.",
  );

  assert(
    owner.email ===
      "owner@example.invalid",
    "Owner identity must preserve the normalized verified email.",
  );

  assert(
    authority.matchesVerifiedEmail(
      "OWNER@EXAMPLE.INVALID",
    ),
    "Verified owner email must authorize the owner.",
  );

  assert(
    authority.matches({
      verifiedEmail:
        "OWNER@EXAMPLE.INVALID",
    }),
    "Verified email must be sufficient for owner authentication.",
  );

  assert(
    authority.matches({
      githubLogin:
        "kevinmfwakley23-ux",
    }),
    "Linked GitHub identity may authorize linked owner operations.",
  );

  assert(
    !authority.matches({
      verifiedEmail:
        "different@example.invalid",
    }),
    "A different email must not authorize the owner.",
  );

  assert(
    !authority.matches({
      githubLogin:
        "different-user",
    }),
    "A different GitHub identity must not authorize the owner.",
  );

  let missingEmailRejected =
    false;

  try {
    new OwnerIdentityAuthority({
      ownerEmail:
        "",
      displayName:
        "K.I.N.G.S. Owner",
    });
  } catch {
    missingEmailRejected =
      true;
  }

  assert(
    missingEmailRejected,
    "Owner configuration without an email must be rejected.",
  );

  console.log(
    "OWNER email-first identity: SUCCESS",
  );

  console.log(
    "OWNER verified email authentication: SUCCESS",
  );

  console.log(
    "OWNER optional GitHub linkage: SUCCESS",
  );

  console.log(
    "OWNER email mismatch rejection: SUCCESS",
  );

  console.log(
    "OWNER GitHub mismatch rejection: SUCCESS",
  );

  console.log(
    "OWNER missing-email configuration rejection: SUCCESS",
  );

  console.log(
    "OWNER EMAIL-FIRST IDENTITY: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
