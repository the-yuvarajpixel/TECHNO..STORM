# Sentinel Firestore Security Specification (Phase 0)

## 1. Data Invariants

1. **Zero-Trust Default Deny**: Every collection not explicitly matched is denied for all reads and writes.
2. **Verified Identity Mandate**: All authenticated reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **PII Isolation (Split Collection)**: Operator email addresses live strictly in `/operators/{operatorId}/private/profile` and are readable only by the verified owner (`request.auth.uid == operatorId`) or a verified admin. Non-PII preferences live separately in `/operators/{operatorId}/public/info`.
4. **No Self-Assigned Privileges**: Users cannot create or mutate `/admins/{adminId}` documents unless already verified as an existing admin (or bootstrapped admin `yuvimyuvarajyuva@gmail.com` with `email_verified == true`).
5. **Relational Integrity on Sessions**: An `/operator_sessions/{sessionId}` document can only be created for the caller's own UID (`incoming().uid == request.auth.uid`) and only after `/operators/{uid}/public/info` exists.
6. **Immutability & Server Timestamps**: `uid` and `createdAt` are immutable after creation; `createdAt` and `updatedAt` MUST strictly equal `request.time`. Session audit entries cannot be updated or deleted once created.
7. **Strict Key & Size Boundaries**: Every write enforces `keys().hasAll(...) && keys().hasOnly(...)` (on create) or `affectedKeys().hasOnly(...)` (on update), every string has explicit min/max bounds, and every single-document path ID matches `^[a-zA-Z0-9_\-]+$` (`<= 128` chars).

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Unauthenticated Read of Private Profile**: `GET /operators/uid_alice/private/profile` with `auth = null`.
2. **Cross-User PII Read**: `GET /operators/uid_alice/private/profile` signed in as `uid_bob` (non-admin).
3. **Unverified Admin Email Spoof**: `GET /admins/uid_alice` signed in with `email = "yuvimyuvarajyuva@gmail.com"` and `email_verified = false`.
4. **Self-Admin Privilege Escalation**: `CREATE /admins/uid_bob` with `{ uid: "uid_bob", grantedBy: "uid_bob", createdAt: serverTimestamp }` as non-admin `uid_bob`.
5. **Shadow Ghost Field Injection**: `CREATE /operators/uid_bob/public/info` including extra field `isAdmin: true`.
6. **Identity Spoofing on Create**: `CREATE /operators/uid_bob/public/info` with `uid: "uid_alice"` while signed in as `uid_bob`.
7. **Client-Forged Timestamp**: `CREATE /operators/uid_bob/public/info` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`.
8. **ID Poisoning / Oversized Path ID**: `CREATE /operator_sessions/<200-char-invalid-chars-id>` with `..` or spaces.
9. **Value Poisoning on Update**: `UPDATE /operators/uid_bob/public/info` changing `displayName` to a 500-character string or a boolean.
10. **Immutable Field Tampering**: `UPDATE /operators/uid_bob/public/info` attempting to change `createdAt` or `uid`.
11. **Orphaned Session Creation**: `CREATE /operator_sessions/sess_01` when `/operators/uid_bob/public/info` does not exist yet.
12. **Blanket Session Scraping (`list`)**: `LIST /operator_sessions` without filtering `where("uid", "==", request.auth.uid)` as non-admin `uid_bob`.
