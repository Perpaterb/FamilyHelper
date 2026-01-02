# Approval Workflow Documentation

## Overview
This document describes the complete approval workflow used throughout the Family Helper application. This flow applies to ALL actions by ALL users regardless of role.

---

## The Universal Approval Flow

Every action in the system follows this exact sequence:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Member initiates action                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. LOG: Record what member wants to do                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. PERMISSION CHECK: Do group/message group settings allow      │
│    this member to do this thing?                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴─────────┐
                    │                   │
                   NO                  YES
                    │                   │
                    ↓                   ↓
    ┌───────────────────────┐  ┌──────────────────────────┐
    │ 4a. Deny action       │  │ 4b. Check if admin       │
    │ LOG: Permission       │  │     approval required    │
    │      denied           │  └──────────────────────────┘
    └───────────────────────┘           │
                                        ↓
                              ┌─────────┴─────────┐
                              │                   │
                             NO                  YES
                              │                   │
                              ↓                   ↓
              ┌────────────────────────┐  ┌──────────────────────────┐
              │ 5a. Execute action     │  │ 5b. Create approval      │
              │ LOG: Action completed  │  │     request              │
              └────────────────────────┘  └──────────────────────────┘
                                                   ↓
                                          ┌─────────────────────────┐
                                          │ 6. Add all group admins │
                                          │    to approval request  │
                                          └─────────────────────────┘
                                                   ↓
                                          ┌─────────────────────────┐
                                          │ 7. If requester is      │
                                          │    admin, mark them as  │
                                          │    approving            │
                                          └─────────────────────────┘
                                                   ↓
                                          ┌─────────────────────────┐
                                          │ 8. TEST: Has approval   │
                                          │    threshold passed?    │
                                          └─────────────────────────┘
                                                   ↓
                                          ┌────────┴────────┐
                                          │                 │
                                         YES               NO
                                          │                 │
                                          ↓                 ↓
                          ┌──────────────────────┐  ┌─────────────────────┐
                          │ 9a. Execute action   │  │ 9b. Check           │
                          │ LOG: Approval passed │  │     auto-approvals  │
                          │      Action done     │  │     LOG: Approval   │
                          └──────────────────────┘  │          created    │
                                                    └─────────────────────┘
                                                             ↓
                                                    ┌─────────────────────┐
                                                    │ 10. For each admin  │
                                                    │     in approval:    │
                                                    │     Check if they   │
                                                    │     pre-approved    │
                                                    │     this action for │
                                                    │     requester       │
                                                    └─────────────────────┘
                                                             ↓
                                                    ┌─────────────────────┐
                                                    │ 11. Auto-approve    │
                                                    │     votes for       │
                                                    │     eligible admins │
                                                    │ LOG: Auto-approvals │
                                                    │      applied        │
                                                    └─────────────────────┘
                                                             ↓
                                                    ┌─────────────────────┐
                                                    │ 12. TEST: Has       │
                                                    │     approval passed │
                                                    │     threshold now?  │
                                                    └─────────────────────┘
                                                             ↓
                                                    ┌────────┴────────┐
                                                    │                 │
                                                   YES               NO
                                                    │                 │
                                                    ↓                 ↓
                                    ┌──────────────────────┐  ┌─────────────────┐
                                    │ 13a. Execute action  │  │ 13b. Wait for   │
                                    │ LOG: Auto-approved   │  │      other      │
                                    │      Action done     │  │      admins to  │
                                    └──────────────────────┘  │      vote       │
                                                              │ LOG: Pending    │
                                                              │      approval   │
                                                              └─────────────────┘
```

---

## Detailed Step Breakdown

### Step 1: Member Initiates Action
- Any member (admin, parent, child, caregiver, supervisor) attempts to perform an action
- Examples: Create message group, hide message, remove member, change role, etc.

### Step 2: Initial Logging
- **Action**: Create audit log entry with status "requested"
- **Log Data**:
  - Action type
  - Requesting member ID and name
  - Target (if applicable)
  - Timestamp
  - Status: "requested"

### Step 3: Permission Check
**Question**: Do the group or message group settings allow this member to do this thing?

**Check against**:
- Group settings (e.g., "Parents can create message groups")
- Message group settings (e.g., "Members can delete their own messages")
- Role-specific permissions

**Outcomes**:
- **NO** → Go to Step 4a (Deny)
- **YES** → Go to Step 4b (Check admin approval requirement)

### Step 4a: Permission Denied
- **Action**: Deny the action
- **Log**: Update audit log with status "denied_permission"
- **Response**: Return error to user explaining they don't have permission
- **END FLOW**

### Step 4b: Check Admin Approval Requirement
**Question**: Does this action require admin approval?

**Actions that DON'T require admin approval**:
- Creating message groups (if role has permission per group settings)
- Sending messages
- Reading messages
- Deleting own messages (if setting allows)
- Creating calendar events (per group settings - anyone with access can create)
- Assigning children to calendar events (per group settings)
- Assigning caregivers to calendar events (per group settings)
- Viewing group information
- Hiding messages (any admin can do without approval)

**Actions that DO require admin approval (>50%)**:
- Adding members
- Removing members
- Changing role FROM admin (demoting)
- Changing group settings (including call recording settings)
- Deleting group
- Deleting files (from storage)
- Deleting call recordings
- Deleting log exports

**Actions that require 100% admin approval**:
- Changing role TO admin (promoting)

**Outcomes**:
- **NO** → Go to Step 5a (Execute immediately)
- **YES** → Go to Step 5b (Create approval)

### Step 5a: Execute Action Immediately
- **Action**: Perform the requested action
- **Log**: Update audit log with status "completed_no_approval_needed"
- **Response**: Return success to user
- **END FLOW**

### Step 5b: Create Approval Request
- **Action**: Create record in `approvals` table
- **Data**:
  ```javascript
  {
    approvalId: uuid,
    groupId: groupId,
    approvalType: string, // e.g., 'remove_member', 'change_role', 'delete_group'
    requestedBy: requesterGroupMemberId,
    requestedAt: timestamp,
    status: 'pending', // Will be updated later
    requiresAllAdmins: boolean, // true for adding admin, false for most
    requiredApprovalPercentage: decimal, // Usually 50.00
    approvalData: {
      // Action-specific data
      targetMemberId: uuid,
      allAdminIds: [uuid], // Snapshot of admins at time of request
      // ... other relevant data
    }
  }
  ```

### Step 6: Add All Group Admins to Approval
- **Action**: Create a record for each admin in the approval
- **Important**: This includes ALL current admins at the time of the request
- **Snapshot**: The `allAdminIds` in `approvalData` preserves who was an admin when the approval was created

### Step 7: Mark Requester as Approving (if admin)
- **Check**: Is the requester an admin?
- **If YES**:
  - Create `ApprovalVote` record:
    ```javascript
    {
      approvalId: approvalId,
      adminId: requesterGroupMemberId,
      vote: 'approve',
      isAutoApproved: false, // They manually requested it
      votedAt: timestamp
    }
    ```
  - **Log**: Record that requester auto-approved by requesting

### Step 8: Test if Approval Threshold Passed
**Calculate**:
```javascript
const totalAdmins = allAdminIds.length;
const approvingAdmins = votes.filter(v => v.vote === 'approve').length;
const approvalPercentage = (approvingAdmins / totalAdmins) * 100;

// Check threshold
if (requiresAllAdmins) {
  passed = approvalPercentage === 100;
} else {
  passed = approvalPercentage > requiredApprovalPercentage; // Usually > 50%
}
```

**Outcomes**:
- **YES (passed)** → Go to Step 9a (Execute)
- **NO (not passed)** → Go to Step 9b (Check auto-approvals)

### Step 9a: Execute Action (Manual Approval Passed)
- **Action**: Perform the requested action
- **Update Approval**: Set status to 'approved', set completedAt timestamp
- **Log**: Update audit log with status "approved_executed"
- **Response**: Notify requester and admins
- **END FLOW**

### Step 9b: Check Auto-Approvals
**Purpose**: See if other admins have pre-approved this action type for the requester

**Query**:
```javascript
// Find all AdminPermission records where:
// 1. Other admins (grantingAdminId) have granted permission to requester (receivingAdminId)
// 2. The specific permission field (e.g., autoApproveRemovePeople) is true

const autoApprovals = await prisma.adminPermission.findMany({
  where: {
    groupId: groupId,
    receivingAdminId: requesterGroupMemberId,
    // Check the specific permission field based on action type
    autoApproveRemovePeople: true, // Example for remove member action
  },
  select: {
    grantingAdminId: true
  }
});
```

**Log**: Record which auto-approvals were found

### Step 10-11: Apply Auto-Approvals
**For each admin in the approval**:
1. Check if they have granted auto-approval for this action to the requester
2. If YES:
   - Create `ApprovalVote` record:
     ```javascript
     {
       approvalId: approvalId,
       adminId: adminGroupMemberId,
       vote: 'approve',
       isAutoApproved: true, // Mark as auto-approved
       votedAt: timestamp
     }
     ```
3. **Log**: Record each auto-approval applied

**Example Scenario**:
- Group has 4 admins: A, B, C, D
- Admin A requests to remove a member
- Admin A automatically approves (requester)
- Admin B has pre-approved "remove members" for Admin A → Auto-approve
- Admin C has NOT pre-approved → No auto-approve
- Admin D has NOT pre-approved → No auto-approve
- **Result**: 2 out of 4 = 50% → NOT > 50% → Does not pass yet

### Step 12: Test if Approval Passed After Auto-Approvals
**Calculate again**:
```javascript
const totalAdmins = allAdminIds.length;
const approvingAdmins = votes.filter(v => v.vote === 'approve').length; // Includes auto-approvals
const approvalPercentage = (approvingAdmins / totalAdmins) * 100;

if (requiresAllAdmins) {
  passed = approvalPercentage === 100;
} else {
  passed = approvalPercentage > requiredApprovalPercentage; // Usually > 50%
}
```

**Outcomes**:
- **YES (passed)** → Go to Step 13a (Execute)
- **NO (not passed)** → Go to Step 13b (Wait)

### Step 13a: Execute Action (Auto-Approval Passed)
- **Action**: Perform the requested action
- **Update Approval**: Set status to 'approved', set completedAt timestamp
- **Log**: Update audit log with:
  - Status: "auto_approved_executed"
  - Which admins auto-approved
  - Final approval percentage
- **Response**: Notify requester and admins
- **END FLOW**

### Step 13b: Wait for Other Admins
- **Status**: Approval remains 'pending'
- **Log**: Update audit log with:
  - Status: "pending_approval"
  - Current approval count
  - Which admins have auto-approved
  - Which admins still need to vote
- **Response**: Notify requester that approval is pending
- **Flow Continues**: When another admin votes, re-run Step 12

---

## Approval Thresholds by Action Type

| Action Type | Threshold | `requiresAllAdmins` | Notes |
|-------------|-----------|---------------------|-------|
| Add members | >50% | false | - |
| Remove members | >50% | false | - |
| Change role TO admin | 100% | true | Promoting requires unanimous consent |
| Change role FROM admin | >50% | false | Demoting requires majority |
| Change group settings | >50% | false | Including call recording settings |
| Delete group | >50% | false | - |
| Delete files | >50% | false | From storage management |
| Delete call recordings | >50% | false | - |
| Delete log exports | >50% | false | - |

**Actions that do NOT require approval:**
| Action | Notes |
|--------|-------|
| Hide messages | Any admin can do |
| Calendar events | Per group settings - anyone with access |
| Assign children to events | Per group settings |
| Assign caregivers to events | Per group settings |

---

## Solo Admin Edge Case

**Scenario**: Group has only 1 admin

**Behavior**:
- The same approval flow is followed
- Approval requests are still created (for audit purposes)
- When the admin creates the approval, they automatically approve it (Step 7)
- Calculation: 1 out of 1 admin = 100% → Always passes
- **Result**: Action executes immediately

**Important**: If a NON-admin member requests an action that requires approval:
- Approval is created
- 0 out of 1 admin has approved = 0%
- **Result**: Does NOT pass, waits for the admin to approve

---

## Auto-Approval Permission Mappings

The `AutoApprovePermission` table stores pre-approval settings between admins.
Each admin can grant permissions to other admins for their actions to be auto-approved.

| Permission Field | Applies To Action Types | Notes |
|------------------|------------------------|-------|
| `canAddMembers` | Add members | >50% approval |
| `canRemoveMembers` | Remove members | >50% approval |
| `canChangeRoles` | Demote from admin | >50% approval |
| `canChangeGroupSettings` | Change group settings | >50% approval (including recording settings) |

**Notes:**
- Promoting to admin (`change_role_to_admin`) always requires 100% approval - cannot be auto-approved
- Actions like hide messages, calendar events, etc. don't require approval at all
- Legacy fields in schema (`canHideMessages`, `canAssignRelationships`, `canChangeRelationships`, `canCreateCalendarEvents`, `canAssignChildrenToEvents`, `canAssignCaregiversToEvents`) are deprecated - these actions don't require approval

---

## Audit Logging

Every step in the approval flow is logged to the `audit_logs` table.

**Key Log Entries**:

1. **Action Requested**:
   ```javascript
   {
     action: 'request_remove_member',
     performedBy: requesterGroupMemberId,
     messageContent: 'Requested to remove John Doe from group',
     logData: { targetMemberId, reason }
   }
   ```

2. **Permission Denied**:
   ```javascript
   {
     action: 'permission_denied',
     performedBy: requesterGroupMemberId,
     messageContent: 'Permission denied to remove member - role Parent cannot remove members'
   }
   ```

3. **Approval Created**:
   ```javascript
   {
     action: 'approval_created',
     performedBy: requesterGroupMemberId,
     messageContent: 'Approval request created to remove John Doe. Requires >50% admin approval.',
     logData: { approvalId, allAdminIds }
   }
   ```

4. **Auto-Approvals Applied**:
   ```javascript
   {
     action: 'auto_approvals_applied',
     messageContent: 'Auto-approvals applied: Admin B, Admin C (2 of 4 admins)',
     logData: { approvalId, autoApprovedBy: [adminB, adminC], currentPercentage: 50 }
   }
   ```

5. **Action Completed (Auto-Approved)**:
   ```javascript
   {
     action: 'remove_member',
     performedBy: requesterGroupMemberId,
     messageContent: 'Removed John Doe from group (auto-approved by 3 of 4 admins)',
     logData: { approvalId, finalVotes, autoApproved: true }
   }
   ```

6. **Action Completed (Manually Approved)**:
   ```javascript
   {
     action: 'remove_member',
     performedBy: requesterGroupMemberId,
     messageContent: 'Removed John Doe from group (approved by 3 of 4 admins)',
     logData: { approvalId, finalVotes, autoApproved: false }
   }
   ```

7. **Awaiting Approval**:
   ```javascript
   {
     action: 'approval_pending',
     performedBy: requesterGroupMemberId,
     messageContent: 'Awaiting approval to remove John Doe. Current: 2 of 4 admins (50%). Need >50%.',
     logData: { approvalId, currentVotes, pendingAdmins }
   }
   ```

---

## Code Implementation Pattern

### Helper Function to Check Auto-Approvals

```javascript
/**
 * Check and apply auto-approvals for a pending approval
 * @param {string} approvalId - The approval ID
 * @param {string} groupId - The group ID
 * @param {string} requesterId - The requesting admin's group member ID
 * @param {string} approvalType - The type of approval (e.g., 'remove_member')
 * @param {string[]} allAdminIds - All admin IDs at time of approval creation
 * @returns {Promise<{shouldExecute: boolean, autoApprovedBy: string[]}>}
 */
async function checkAndApplyAutoApprovals(approvalId, groupId, requesterId, approvalType, allAdminIds) {
  // Map approval type to permission field
  const permissionField = getPermissionFieldForApprovalType(approvalType);

  // Find which admins have granted auto-approval for this action to the requester
  const autoApprovalPermissions = await prisma.adminPermission.findMany({
    where: {
      groupId: groupId,
      receivingAdminId: requesterId,
      [permissionField]: true,
    },
    select: {
      grantingAdminId: true,
      grantingAdmin: {
        select: {
          displayName: true
        }
      }
    },
  });

  const autoApproveGrantingAdmins = autoApprovalPermissions.map(p => p.grantingAdminId);
  const autoApprovedBy = [];

  // Create auto-approval votes
  for (const permission of autoApprovalPermissions) {
    // Only create vote if this admin is still in the allAdminIds snapshot
    if (allAdminIds.includes(permission.grantingAdminId)) {
      await prisma.approvalVote.create({
        data: {
          approvalId: approvalId,
          adminId: permission.grantingAdminId,
          vote: 'approve',
          isAutoApproved: true,
        },
      });
      autoApprovedBy.push(permission.grantingAdmin.displayName);
    }
  }

  // Log auto-approvals
  if (autoApprovedBy.length > 0) {
    await prisma.auditLog.create({
      data: {
        groupId: groupId,
        action: 'auto_approvals_applied',
        messageContent: `Auto-approvals applied: ${autoApprovedBy.join(', ')} (${autoApprovedBy.length} of ${allAdminIds.length} admins)`,
        logData: { approvalId, autoApprovedBy },
      },
    });
  }

  // Check if approval now passes
  const approval = await prisma.approval.findUnique({
    where: { approvalId },
    include: {
      votes: true,
    },
  });

  const approvingCount = approval.votes.filter(v => v.vote === 'approve').length;
  const totalAdmins = allAdminIds.length;
  const approvalPercentage = (approvingCount / totalAdmins) * 100;

  let shouldExecute = false;
  if (approval.requiresAllAdmins) {
    shouldExecute = approvalPercentage === 100;
  } else {
    shouldExecute = approvalPercentage > Number(approval.requiredApprovalPercentage);
  }

  return {
    shouldExecute,
    autoApprovedBy,
    currentPercentage: approvalPercentage,
  };
}

/**
 * Map approval types to AdminPermission fields
 */
function getPermissionFieldForApprovalType(approvalType) {
  const mapping = {
    'hide_message': 'autoApproveHideMessages',
    'change_message_deletion_setting': 'autoApproveChangeMessageDeletionSetting',
    'add_member': 'autoApproveAddPeople',
    'remove_member': 'autoApproveRemovePeople',
    'change_role_from_admin': 'autoApproveChangeRoles',
    'change_role_to_admin': null, // Always requires 100%, no auto-approve
    'change_role': 'autoApproveChangeRoles',
    'assign_relationship': 'autoApproveAssignRelationships',
    'change_relationship': 'autoApproveChangeRelationships',
    'create_calendar_event': 'autoApproveCalendarEntries',
    'assign_children_to_event': 'autoApproveAssignChildrenToEvents',
    'assign_caregivers_to_event': 'autoApproveAssignCaregiversToEvents',
    'delete_group': null, // No auto-approve for group deletion
  };

  return mapping[approvalType];
}
```

---

## Testing the Flow

### Test Case 1: Solo Admin Creates Approval
- **Setup**: Group with 1 admin
- **Action**: Admin requests to remove a member
- **Expected**:
  1. Approval created
  2. Admin auto-approves (as requester)
  3. Calculation: 1/1 = 100% > 50% ✓
  4. Action executes immediately
  5. Logs show "approved_executed"

### Test Case 2: Auto-Approval Passes
- **Setup**: Group with 3 admins (A, B, C)
- **Pre-conditions**:
  - Admin B has pre-approved "remove members" for Admin A
  - Admin C has pre-approved "remove members" for Admin A
- **Action**: Admin A requests to remove a member
- **Expected**:
  1. Approval created
  2. Admin A auto-approves (requester)
  3. Step 8: 1/3 = 33.33% ≯ 50% → Fail
  4. Auto-approvals applied: B and C
  5. Step 12: 3/3 = 100% > 50% ✓
  6. Action executes
  7. Logs show "auto_approved_executed"

### Test Case 3: Awaiting Manual Approval
- **Setup**: Group with 4 admins (A, B, C, D)
- **Pre-conditions**:
  - Only Admin B has pre-approved "remove members" for Admin A
- **Action**: Admin A requests to remove a member
- **Expected**:
  1. Approval created
  2. Admin A auto-approves (requester)
  3. Step 8: 1/4 = 25% ≯ 50% → Fail
  4. Auto-approval applied: B
  5. Step 12: 2/4 = 50% ≯ 50% → Fail (must be OVER 50%)
  6. Approval remains pending
  7. Logs show "pending_approval"
  8. Admin C or D must manually vote

### Test Case 4: Non-Admin Request
- **Setup**: Group with 2 admins, Parent member P
- **Action**: Parent P requests to remove a member (if somehow allowed by permission check)
- **Expected**:
  1. Approval created
  2. No auto-approve (requester is not admin)
  3. Step 8: 0/2 = 0% ≯ 50% → Fail
  4. No auto-approvals (only admins get auto-approval)
  5. Step 12: 0/2 = 0% ≯ 50% → Fail
  6. Approval remains pending
  7. At least 2 admins must manually approve

---

## Summary

This approval workflow ensures:
1. **Complete audit trail**: Every action is logged at every step
2. **Consistent logic**: All actions follow the same flow
3. **Flexible permissions**: Settings control who can do what
4. **Efficient approvals**: Auto-approvals reduce friction for trusted admin pairs
5. **Democratic decisions**: Threshold voting ensures no single admin has too much power
6. **Solo admin functionality**: Single admins can still manage their groups
7. **Security**: All admin actions are tracked and require appropriate authorization

By following this flow religiously, the application maintains transparency, accountability, and proper authorization for all group management actions.
