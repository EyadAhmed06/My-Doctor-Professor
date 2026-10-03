# Trusted Student Device Binding

## Security invariant

For ordinary student accounts, My Doctor Professor allows at most one active trusted browser device and at most one active authentication session:

```
active_trusted_devices(student) <= 1
active_sessions(student) <= 1
```

Instructors and system administrators remain exempt from student device binding.

## Enrollment

Normal student registration generates a non-extractable P-256 ECDSA private key in the browser. The private `CryptoKey` is stored in IndexedDB and is never sent to the server. Registration sends only:

- a random client device UUID,
- the public JWK,
- a human-readable browser/device label.

The server stores that public key as the student's active trusted device.

Legacy or administrator-created student accounts may have no trusted device. Their first password-verified login after rollout becomes the initial trusted browser. This is a deliberate migration rule because a historical physical device cannot be reconstructed cryptographically.

## Login

A password or Google identity is not sufficient for an enrolled student.

1. The client submits credentials plus its device UUID/public key.
2. If the device does not match the active trusted device, the server records a pending device-access request and returns `DEVICE_NOT_AUTHORIZED`.
3. If it matches, the server returns a short-lived, single-use random challenge.
4. The browser signs the decoded challenge bytes with its non-extractable private key.
5. The server verifies the ECDSA P-256/SHA-256 signature before issuing a session.

The client device UUID is metadata only. Authorization depends on possession of the private key.

## Replacement device

A denied login from another browser creates or updates a pending replacement request. A system administrator reviews it in User Administration.

Approval is transactional:

1. lock the student,
2. revoke the old trusted device,
3. revoke all existing student sessions,
4. activate the requested device public key,
5. mark the chosen request approved and other pending requests cancelled,
6. write an audit record.

The student must sign in again from the newly approved browser.

Rejection leaves the current trusted device unchanged.

## Refresh and revocation

Student refresh sessions are linked to `trusted_device_id`. Refresh is rejected when its linked device is no longer the active trusted device. Admin replacement revokes all sessions, and JWT validation also rejects revoked sessions, so the old browser loses API access immediately rather than waiting for the access token to expire.

## Password reset

Password reset revokes sessions but does not replace the trusted device. Device replacement remains an explicit administrator decision.

## Browser-storage loss

Clearing site data, reinstalling the browser, using another browser, or resetting the device can remove the non-extractable private key. That browser must then request device replacement. A normal web application cannot reliably identify a physical handset independently of browser storage.

## Database objects

- `trusted_devices`
- `device_access_requests`
- `device_auth_challenges`
- `auth_sessions.trusted_device_id`

The database enforces a partial unique index permitting only one `ACTIVE` trusted device per user.

## Rollout

The trusted-device migration revokes pre-existing unrevoked student sessions. This prevents legacy refresh cookies from bypassing the new device-binding boundary. Existing students then establish their initial trusted browser on their next password-verified login.


## Device-request reliability hardening

A replacement request is accepted only after the requesting browser proves possession of the private key corresponding to the proposed public JWK. The browser signs the canonical message:

```
MDP_DEVICE_BINDING_V1
<device UUID>
EC
P-256
<x coordinate>
<y coordinate>
```

The backend verifies that signature before creating or updating a pending request. This prevents an administrator from approving a public key that the requesting browser cannot actually use.

The browser also self-tests its IndexedDB key pair before every authentication flow. If the stored private key and public JWK no longer form a valid pair, the browser generates a fresh identity before asking for device approval.

Device identity initialization is serialized across tabs so two concurrent tabs do not race and leave IndexedDB pointing at a different key than the one submitted for approval.

Pending requests are unique per `(user_id, client_device_id)`, not merely per user. Approving one device still revokes the current trusted device, revokes active sessions, and cancels every other pending replacement request, preserving the one-active-device invariant.

Login challenges are now marked consumed only after the ECDSA signature verifies successfully. Signature verification accepts the WebCrypto IEEE-P1363 representation and a DER fallback for runtime interoperability.
