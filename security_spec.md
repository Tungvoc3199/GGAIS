# Security Specification (TDD) - LỊCH HỌC PRO

## 1. Data Invariants
- **Identity Integrity**: Users can only read and write their own User Profile doc `users/{userId}`.
- **Role-Based Access Control (RBAC)**: Only verified users with the `Admin` role can configure system parameters (`settings/{settingsId}`), delete documents, or view the complete audit logs. Admin check is done by reading `users/{request.auth.uid}` document data.
- **Payment Integrity**: Payments cannot be hard-deleted or altered once submitted. Payment records are only allowed to be created or marked as cancelled (`isCancelled: true`) with an audit trail, and cannot be deleted from the client SDK (delete: if false).
- **Relational Integrity**:
  - Creating a `Lesson` requires validating that `studentId` points to an existing student, `instructorId` to an existing instructor, and `vehicleId` to an existing vehicle.
  - Creating a `Payment` requires validating that `studentId` points to an existing student.
- **Immutability Protection**: Fields such as `createdAt`, `createdBy`, and `originalOwnerId` are immutable upon creation.
- **Temporal Integrity**: All timestamp fields (`createdAt`, `updatedAt`, `timestamp`) must match `request.time`.

---

## 2. The "Dirty Dozen" Payloads (Exploit Vector Simulation)

### Payload 1: Privilege Escalation (User attempts to self-promote to Admin)
- **Path**: `users/attacker_uid`
- **Method**: Write / Update
- **Data**: `{ role: "Admin", email: "attacker@gmail.com", displayName: "Attacker" }`
- **Expected Result**: `PERMISSION_DENIED`

### Payload 2: Hostile Administrative Hijack (Unauthorized Settings Override)
- **Path**: `settings/schoolSettings`
- **Method**: Write
- **Data**: `{ schoolName: "Hacked School", timezone: "UTC" }` (by non-Admin)
- **Expected Result**: `PERMISSION_DENIED`

### Payload 3: Orphaned Payment Transaction (Payment without a valid Student)
- **Path**: `payments/pay_spoof`
- **Method**: Create
- **Data**: `{ amount: 1000000, studentId: "non_existent_student", isCancelled: false }`
- **Expected Result**: `PERMISSION_DENIED` (no student exists)

### Payload 4: Arbitrary Invoice Cancellation (Staff attempts to cancel invoice without admin rights, or Instructor bypasses)
- **Path**: `payments/pay_123`
- **Method**: Update
- **Data**: `{ isCancelled: true, cancellationReason: "Stealing money" }` (by Instructors/Staff)
- **Expected Result**: `PERMISSION_DENIED`

### Payload 5: Spoofed Author/CreatedBy Field
- **Path**: `payments/pay_spoof_user`
- **Method**: Create
- **Data**: `{ amount: 1000000, studentId: "stud_1", createdBy: "admin@lichhocpro.vn" }` (sent by `attacker@gmail.com` where uid doesn't match admin email)
- **Expected Result**: `PERMISSION_DENIED`

### Payload 6: Hard-Deleting Financial Ledger (Payment deletion bypass attempt)
- **Path**: `payments/pay_123`
- **Method**: Delete
- **Expected Result**: `PERMISSION_DENIED` (all users, including Admin, must do soft-delete/cancellations only through UI to retain audit trails)

### Payload 7: Shadow Update on Vehicle Record (Adding unapproved metadata field)
- **Path**: `vehicles/veh_1`
- **Method**: Update
- **Data**: `{ status: "Sẵn sàng", ghostField: "unauthorized_pwr" }`
- **Expected Result**: `PERMISSION_DENIED` (Strict Key Enforcement)

### Payload 8: Chrono-Fudging (Backdating lesson creation)
- **Path**: `lessons/less_1`
- **Method**: Create
- **Data**: `{ date: "2026-06-01", createdAt: "2020-01-01T00:00:00Z" }` (where client sends fabricated past timestamp)
- **Expected Result**: `PERMISSION_DENIED`

### Payload 9: Denial-of-Wallet Path Exhaustion (Bombarding ID with 10KB string)
- **Path**: `students/stud_very_long_path_id_greater_than_128_chars_designed_to_bloat_indexing_costs`
- **Method**: Create
- **Expected Result**: `PERMISSION_DENIED` (isValidId regex limits string sizes)

### Payload 10: Unauthorized Student Deletion (Instructor attempts to wipe student records)
- **Path**: `students/stud_1`
- **Method**: Delete (by Instructor / Staff)
- **Expected Result**: `PERMISSION_DENIED`

### Payload 11: Tampering Completed Lesson (Bypassing completed sessions counter lock)
- **Path**: `lessons/completed_lesson_1`
- **Method**: Update
- **Data**: `{ notes: "Manipulating completed log notes" }` (where existing status is terminal 'Đã hoàn thành')
- **Expected Result**: `PERMISSION_DENIED`

### Payload 12: Eavesdropping Global Audit logs (Anonymous query of administrative actions)
- **Path**: `auditLogs`
- **Method**: List / Get (without Admin credentials)
- **Expected Result**: `PERMISSION_DENIED`

---

## 3. Test Runner Mock Draft (`firestore.rules.test.ts`)
```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// Test implementation mapping to our rules definitions...
```
