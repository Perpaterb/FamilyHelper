**3 Products, 1 Backend (KISS Principle)**

This platform consists of 3 separate products sharing one backend:

1. **Admin Web App** (familyhelperapp.com) - React web application
   - Subscription management & payments (Stripe)
   - Storage upgrades & billing
   - Log exports
   - My Account management
   - BUILT FIRST (no payments in mobile apps)

2. **Family Helper Mobile App** - React Native (iOS + Android)
   - Full features: messaging, calendar, finance, admin
   - NO payment features (links to web app for subscriptions)
   - BUILT SECOND (after web app)

3. **FH Messenger Mobile App** - React Native (iOS + Android)
   - Messaging only, biometric auth
   - For children and restricted devices
   - BUILT THIRD (after main app)

**Pricing:**
This app can be used by any non-group admin parent for free. Anyone wanting to administer a group which includes having access to a backup, images, videos and the logs of each group will need a subscription of **$3 USD per month** (managed via web app). This gets them 10GB of storage. Additional storage is charged in **10GB chunks** at **$1 USD per 10GB block per month** (metered billing).

**Competitive Advantage:** Our main competitor charges $9 USD/month - we're offering the same features for a third of the price.

**20-Day Free Trial:**
- New users (age 16+) automatically get 20-day free trial with **full admin access**
- **NO RESTRICTIONS during trial** - full admin features available
- Trial users can create groups and be admin
- Can add multiple admins during trial (restriction removed)
- **Visibility Banner (shown to ALL group members):**
  - Text: "[Admin Name] needs to subscribe in X days or this group will be archived"
  - Colors change based on urgency: Yellow (days 20-6), Orange (days 5-2), Red (day 1)
  - Location: Top of group screen (persistent until subscription)
  - "Remind [Admin]" button sends notification to trial admin
- **Post-trial behavior:**
  - Admin subscribes: Banner removed, group continues normally
  - Trial expires: Group archived (read-only), data preserved, can reactivate by subscribing

**Storage Management Rules:**
- Base plan: 10GB included at $3 USD/month
- Overage: $1 USD per 10GB chunk (metered billing via Stripe)
- **Billing in chunks**: Storage is charged in 10GB blocks. If you use 11GB, you're charged for 1 additional 10GB block ($1). If you use 19GB, you're charged for 1 block. If you use 21GB, you're charged for 2 blocks ($2).
- When storage exceeds limit: Automatically charge for additional 10GB blocks ($1 USD per 10GB chunk)
- Send email notification: "Your storage has been increased to XGB. You'll be charged $X USD on your next billing cycle"
- Show warning at 80% capacity in My Account
- Additional Storage card displays "Automatically charged as needed" (no manual add storage button)
- Storage tracked per admin across all their groups
- All prices displayed as $USD (e.g., "$3.00 USD/month") for currency clarity

**Storage Cleanup Tool (Admin Feature):**
Admins need tools to manage their storage and avoid overage charges. The Storage Cleanup screen provides:

1. **Storage Overview Dashboard:**
   - Total storage used across all groups
   - Storage breakdown by group
   - Storage breakdown by type (images, videos, documents, audit logs)
   - Visual progress bar showing usage vs. 10GB limit
   - Cost calculator: "You're using 12.3GB = $3 base + $0.30 overage = $3.30/month"

2. **File Browser with Sorting & Filtering:**
   - Sort by: Size (largest first), Date (oldest first), Type, Group
   - Filter by: File type (images/videos/documents), Date range, Specific group
   - Search by: Filename, Group name
   - List view shows: Thumbnail/preview, filename, size, date uploaded, group name, file type

3. **Bulk Selection & Deletion:**
   - Checkbox selection for multiple files
   - "Select All" / "Deselect All" buttons
   - "Select all files over 5MB" quick action
   - "Select all files older than 1 year" quick action
   - Bulk delete button with confirmation dialog
   - Shows space that will be freed: "Delete 23 files (456 MB)"

4. **File Preview & Details:**
   - Click file to preview (images show full size, videos show player)
   - File metadata: Uploaded by, uploaded date, associated message/event, group
   - Context link: "View in Messages" or "View in Finance" to see where file is used
   - Individual delete button per file

5. **Safety Features:**
   - **Audit log exports are PROTECTED** - cannot be deleted via cleanup tool
   - Files associated with active finance matters show warning: "This file is part of an active payment dispute"
   - **CRITICAL: Multi-Admin Approval Required** - File deletion requires >50% admin approval
   - Warning modal with MULTIPLE confirmations before initiating approval request
   - Approval workflow:
     - Admin requests deletion → Other admins vote → >50% approval → 24hr grace period → Hard delete
     - Soft delete first (isHidden = true), wait 24 hours, then permanently delete from filesystem
     - Audit logs and filenames preserved forever (only file content deleted)
     - Storage recalculated for ALL admins after hard delete
   - Confirmation dialog shows: "Are you sure? This requires approval from >50% of admins. Once approved and 24 hours pass, X files (YMB) will be PERMANENTLY deleted. This CANNOT be undone."
   - Items referencing deleted files show: "🗑️ File deleted (filename.jpg)"
   - **Web App Only**: File deletion ONLY available in web-admin Storage Management page (NOT in mobile apps)

6. **Recommendations Engine:**
   - "You have 45 images over 5MB. Consider compressing or deleting."
   - "23 videos from 2023 are taking up 3.2GB. Review old videos?"
   - "Oldest files: 156 files from 2022 (1.8GB)"

**Technical Implementation:**
- Web admin app only (primary use case)
- Backend endpoint: `GET /storage/analysis` - Returns file list with metadata
- Backend endpoint: `DELETE /storage/files` - Bulk delete with file IDs array
- S3 integration: Direct delete from bucket, update storage_usage table
- Real-time storage recalculation after deletion

**Subscription Cancellation:**
- Access ends at end of current billing period (not immediately)
- Ensures legal continuity for co-parenting documentation

**Subscription Expiry Handling:**

When an admin's subscription expires (trial ends or payment fails), the following happens:

*For groups where they are the ONLY admin:*
- Group enters **Read-Only Mode** (`hasActiveAdmin = false`)
- "READ ONLY - No Active Admin" badge appears on group card and dashboard
- All members can still VIEW everything but cannot:
  - Send messages in message groups
  - Create/edit calendar events
  - Make phone or video calls
  - Create/edit wiki pages
  - Upload/modify secure documents
  - Create/edit finance matters
  - Create/edit Secret Santa
  - Create/edit group item/gift registries
- **Personal item/gift registries are unaffected** (users can still manage their own)
- Data is preserved - group can be reactivated when admin subscribes

*For groups where there are OTHER subscribed admins:*
- Expired admin's role automatically changes from `admin` to `adult`
- They retain access as a regular adult member
- Other admins continue to manage the group normally
- If they re-subscribe, an existing admin can promote them back to admin

*Reactivation:*
- When the expired user subscribes again, groups they were sole admin of will need manual reactivation
- Support can also manually restore admin status via the Support Dashboard

*Support Dashboard Tools:*
- "Expire Subscription" button - Sets subscription end date to yesterday for testing
- Shows which groups were affected and how (read-only vs role change)
- All actions logged in Support Audit Log

**Group Admin Requirements:**
- Groups require at least one admin at all times - UI prevents last admin from leaving
- If last admin's subscription expires: Show banner "Group will be archived on [DATE] because [ADMIN]'s subscription ends"
- Nothing permanently deleted from servers - resurrection via support ticket possible 

In "my account"  there would need to be a storage tracker. to show and warn what it is costing them. It will be changed monthly.

**Technology Stack:**
- Web App: React (deployed to AWS S3 + CloudFront)
- Mobile Apps: React Native with Expo (iOS + Android for MVP1)
- Backend: Serverless infrastructure on AWS
- Storage: AWS S3
- Server functions: AWS Lambda (production) + Docker (dev)
- Infrastructure as Code: Terraform
- Authentication: Kinde (email + MFA)
- Payments: Stripe (web app only)

**Core Functionalities:**
Mobile apps provide 3 main features:
1. Messaging
2. Calendar (with child responsibility tracking)
3. Finance (payment tracking, NOT payment processing)

Web app provides admin features:
1. Subscription management
2. Payment processing
3. Storage upgrades
4. Log exports
5. My Account settings

All Accounts can have different roles in different groups but only one role per group

No groups or messages can ever be deleted. They can only be hidden from non group admins. People can be allowed to "delete" their own messages but they are still visible to admins with hidden symbols on them and they are a little greyed out.

Every change message edits,,, everything that happens on a group is logged with a timestamp of the people that did it. groups admins can download this log at any point. The log, images and videos for each group are backed up in each admin's storage and can only be deleted by a user after they have left a group. Eash admin's storage is taken up by everything put into a group. 

**Mobile App Structure** (Family Helper):
Login screen
\/
Home page
├ App setting
├ My Account (shows storage, links to web for billing)
└All groups list
   in each group
   ├ Group settings
   ├ Approvals list
   ├ Messages
   │    └All message groups list
   │       in each Message group
   │        ├ Message group settings
   │        └ Messages
   ├ Calendar
   │    ├ Calendar settings
   │    └ Calendar
   └ Finance
        └All Finance matters list
           in each Finance matter
            └ Finance matter

**Web App Structure** (Admin Portal):
Login screen (Kinde)
\/
Dashboard
├ Subscription Management
│  ├ Plans & Pricing
│  ├ Payment Method
│  ├ Billing History
│  └ Storage Upgrades
├ My Account
│  ├ Storage Tracker
│  └ Account Settings
└ Log Exports
   ├ Request Export (select timeframe)
   └ Export History

All pages have the ability to go back / out a level with a button in the top left of the page and by swiping left (mobile only).  

**Main Components to Build**

Web App Components:
- Login screen (Kinde)
- Dashboard
- Subscription management page
- Payment method form (Stripe Elements)
- Storage tracker
- Billing history
- Log export form
- My account settings

Mobile App Components:
- Login screen (Kinde)
- Home page
- App settings
- My account (with link to web)
All groups list
Create group component
Groups list view group card
Member icons
Group settings
Group main page
Group main page big button
Approvals list
Approvals list card
All Messages groups list
Create Messages groups component
Messages groups list view Messages group card
Messages group settings
Messages page
Message components 
Message creation components
Calendar settings
Calendar
Child and responsibility line pop up component
Calendar Day View component
Calendar Week View component
Calendar Month view component
Even type selection component
Create event component
Create child responsibility event component
Responsibility selector slider component
All Finance matters list
Create Finance matters component
Finance matter list card
Finance matter
Finance matter description component
Finance matter description bar component
Report payment component

Group Roles types
Admin (A parent+ role, Can create groups, minimum 1 admin per group, requires subscription, Can access all logs and backups of group)
Parent 
Child
Caregiver
Supervisor (This is a family Supervisor not a child supervisor. A child supervisor is a caregiver if this option is selected when a person is being added to a group this warning should come up.) This user can only view but not interact in any other way.

**IMPORTANT: 3-Product Architecture**
This app consists of 3 products sharing 1 backend:
1. **Admin Web App** (familyhelperapp.com) - Subscriptions, payments, log exports - BUILT FIRST
2. **Family Helper Mobile App** - Full features (messaging, calendar, finance) - NO payment features - BUILT SECOND
3. **PH Messenger Mobile App** - Messaging only - BUILT THIRD

**Payment/Subscription Management:**
- ALL payment and subscription features are in the Web App ONLY (KISS principle)
- Mobile apps have NO Stripe integration, NO payment forms, NO in-app purchases
- Mobile apps link to web app for subscription management
- Benefits: Simpler code, no Apple/Google 30% fee, easier payment updates

**Security & Privacy:**
- **Secure & Encrypted Messaging**: All message content encrypted at rest using AES-256-GCM
  - Messages encrypted before storage in database (ciphertext only in PostgreSQL)
  - Decrypted on-the-fly when users view messages
  - Admins can decrypt messages during log exports for compliance/legal purposes
  - Encryption key stored securely (environment variable in dev, AWS Secrets Manager in production)
  - Algorithm: AES-256-GCM (authenticated encryption with 256-bit key)
- **Transport Security**: All API communication via HTTPS/TLS
- **Authentication**: Kinde OAuth with MFA support
- **Authorization**: Role-based access control (RBAC) enforced at API layer
- **Audit Logging**: All actions logged immutably (cannot be deleted)

---

Login Page (Mobile Apps)
Using Kinde
Simple login with email MFA in MVP1
After login, redirects to Home page

Home page (Mobile App)
App setting
My Account (shows storage usage, links to web for billing)
logout button
All groups list
Subscribe button (only if not subscribed) → Opens familyhelperapp.com/subscribe in browser

Subscription Management (Web App ONLY)
ALL subscription/payment features happen on the web app at familyhelperapp.com:
- View subscription plans ($3/month for 10GB)
- Enter payment method (Stripe Elements)
- Additional storage ($1 per 10GB)
- View billing history
- Update payment method
- Cancel subscription
- Subscription payment happens on the same day each month  

All groups list
List of all the groups as "Groups list view group card" that user is a member of. Admins can see all groups
Groups can be pinned to the top. otherwise are listed by latest activity.
Pinned groups are in order of pinning.
Admins have the ability to create a new group with a "Create" button on the top right

Create group component
This allows an admin to create a new groups. Only asks for a group name, icon and background image of colour. give the admin the ability to upload an image to use as the background. this backgroups is only used by the. "Groups list view group card"
All other administration is done from inside the group.

Groups list view group card
The "Groups list view group card" has the name of the group in the top left.
Top right has a cog for accessing the Group settings quickly
Top right pin button
Below the group name it has the icons of all the members. 

Member icons
A circle with the allocated colour and the icon letters (up to 3 letters). 
pressing on an icon will expand the icon circle into a pill shape (half circle either end and a rectangle between) to show the members name. And their role in the group.
The role they have in the group appears as a little coloured circle in the top left of the Member icons. Gold = admin,  Red = parent,  Yellow = Caregiver, Blue = child, Pink = Supervisor.

Group main page
Small buttons for Group settings
large buttons for
Approvals list
Messages groups
Calendar
Finance (only visible to roles that have access indicated by admins in groups settings
Group main page big button
A button with the text on it.
If more then one item in that buttons section needs to be actioned by the logged in user a red pill will appear with the number of actions that need to be actioned

Group settings (accessible from the cog inside the group of on the Groups list view group card)
All roles have mute or leave option. Admins can request to leave If they are the only admin this is a request to delete the group and can only be approved by the application support after viewing the logs to make sure nothing problematic is happening. If they are not the only admin approval from over 50% other admins is needed.
All roles have notification switches on/off
Request notification
All Message notification
Only @me Message notification
All Calendar notification
Only @me Calendar notification
All Finance matter notification
Only @me Finance matter notification

Role specific setting  
Admins
Add edit and remove members. allocate a colour, names and an icon letters to members.
It is recommended that all people that supervise a child are added as a member of the group. school, places and institutions do not need to be added. They do not need to be a user of the app. They can be added and removed at any point.
A person can have an email address allocated to them and they will send them an invite to the group or the app and the group if they have not registered with the app yet. 
Add and edit and remove all relationships.
Allocate role preferences for the group
Select denomination for finance
Select date format
Log Export (Web App ONLY): Admins go to familyhelperapp.com/logs to request log exports. Admin specifies timeframe. Logs emailed as CSV with password-protected media links (valid 1 week). Mobile app shows link to web for log exports. 
Assign a new admin (note this needs to be a subscriber)
Settings Switches
Parents can create message groups and send invites to members of the group
Children can create message groups and send invites to members of the group
Caregiver can create message groups and send invites to members of the group
Finance matters visible to parents
Finance matters can be created by parents (greyed out and off if "Finance matters visible to parents" option is off)
Finance matters visible to caregivers
Finance matters can be created by caregivers (greyed out and off if "Finance matters visible to caregivers" option is off)
Finance matters visible to children
Finance matters can be created by children (greyed out and off if "Finance matters visible to children" option is off)

**Feature Visibility Controls:**
Admins can hide entire features from the group dashboard for adults and/or children. Hidden features don't appear in the navigation for those members.

Section: "Group Features"

Adults (Parents, Caregivers, Supervisors):
- Allow adults to see Messages
- Allow adults to see Calendar
- Allow adults to see Finance (cascades with "Finance matters visible to" switches above)
- Allow adults to see Gift Registry
- Allow adults to see Secret Santa
- Allow adults to see Item Registry (books, tools, borrowable items)
- Allow adults to see Wiki
- Allow adults to see Secure Documents

Children:
- Allow children to see Messages
- Allow children to see Calendar
- Allow children to see Finance (cascades with "Finance matters visible to" switches above)
- Allow children to see Gift Registry
- Allow children to see Secret Santa
- Allow children to see Item Registry (books, tools, borrowable items)
- Allow children to see Wiki
- Allow children to see Secure Documents

Notes:
- Approvals section is always hidden from non-admins (admin-only feature)
- If a feature is hidden, users cannot see it in dashboard navigation
- Default: All features visible to both adults and children
- These settings are per-group (different groups can have different visibility)
- Use case: Some families may only want messaging, others only want calendar + finance
I allow this group admin to: (See all other admins under each one all the switches to auto approve administrative changes they make. )
hide any message without my approval. (admins can still see)
add people without my approval.
remove people without my approval.
assign a role to a new user without my approval.
change a role to a non admin user without my approval.
assign a relationship to a user without my approval.
change a relationship to a non admin user without my approval.
make calendar entries without my approval.
assign children to calendar entries without my approval.
assign a caregiver or including myself to calendar entries without my approval.
More than 50% of the Admins must approve the removal of another admin. all admins must approve the addition of another admin. More than 50% of the Admins must approve a group to be hidden.

Unsubscribe option: This will send and email to them with a link to confirm that they don't want to be subscribed anymore. Telling them that there access will be removed at the end of their current payment period.

Parent
Can see which group members are linked to them in relationships.
Can request for admin to add another member.
If allowed by admin an option create new message group
If allowed by admin a list of message group they created with a send invite button that opens a list of group members. on selection if that member is not a member of that message group already they will get an approval request to be added.

Child
If allowed by admin an option create new message group
If allowed by admin a list of message group they created with a send invite button that opens a list of group members. on selection if that member is not a member of that message group already they will get an approval request to be added.

Caregiver
If allowed by admin an option create new message group
If allowed by admin a list of message group they created with a send invite button that opens a list of group members. on selection if that member is not a member of that message group already they will get an approval request to be added.

Supervisor
Nothing special

Logs
Admins of a group can request the logs to be emailed to them. The logs email will generate a password that can be used to access each media link in that log.
Logs are a CSV file with everything single things that has happened in the group by everyone and how did it and when they did it.
CSV Logs column date, time, action, action location, users name, users email (if applicable), message content (if applicable), link to media (if applicable) 

for example if a user send a message to a message group
Logs would show the date, time, action might be "sent message", action location "message group {name of the message group}. "message content" {the message sent as a string including emojis in string form}, "link to media" If the message had images or videos then a link to each is generated.
Media log links are generated when logs email is created. Images and videos can have many links connected to them. 

Approvals list
Just shows a list of approvals that have been requested by this user or of this user for that group
3 lists of "Approvals list card" arranged by date
Approvals awaiting your action (Have reject or approve buttons) (Finance matters have a button that takes them to the Finance matters they can't be settled from the "Approvals list")
Approvals you have made awaiting the action of others ( Have cancel button)
All canceled, reject or approved Approvals (can't be edited)
Approvals list card
Card that shows the info about the approval and has the action buttons along the bottom.

All Messages groups list
A list of all the Messages group as "Messages groups list view Messages group cards" that user is a member of. Admins can see all Messages groups even if they are not members and can't send messages
Messages groups can be pinned to the top. otherwise are listed by latest activity.
Pinned groups are in order of pinning.
If people have a role with the ability to create a Message group they see a "Create" button on the top right

Create Messages groups component

Messages groups list view Messages group card
The "Messages groups list view Messages group card" has the name of the messages group in the top left,
Top right has a cog for accessing the Messages group settings
Top right pin button
Top right Red pill with the number of unread messages If any
Top right yellow pill with the number of @ you messages if any 
Below the messages group name it has the icons of all the members

Messages group settings (accessible from the cog inside  each messages group view)
Admins
Parent
Child
Caregiver
Supervisor

Messages page
This just looks like a whatsapp message page
At the bottom there is a + on the left to send images and videos from the photos and video on the phone. This button disappears is there is any text in the "Message creation components" and the "Message creation components" fills the bottom of the page.
The rest of the bottom is taken up by the "Message creation components"You can @ other messages group members so they will see that they have an @ message from the "Messages groups list view Messages group card"

Message components
Word wrap is enables
Messages you send have a yellow background
Messages from other people send have a grey background
Messages you have been @ed  in have a 1px blue boarded until you have see the message.
Messages sent statuses (only on message you send)
seen by all 2 blue diamonds
seen by some 1 blue diamond 1 grey diamond
seen by none but delivered to server 2 grey diamonds
sent by you but not confirmed received by server yet 1 grey diamond

**CRITICAL: Messages CANNOT be edited - only deleted (hidden)**
- No edit button on messages - editing not allowed for legal/custody context
- Only delete button which hides message (is_hidden = true)
- Deleted messages visible to admins (greyed out with 🚫 icon)
- All deletions logged in audit_logs with original message content
- If user needs to correct, they must send a new message

Message creation components
Just a standard text field that starts as one line and expanded to 10 lines and then becomes a scrollable text field.
Word wrap is enables.
Note "supervises" don't see this and can't message. all other roles can 

Calendar settings (accessible from the cog inside each main calendar view) 
Admins
Parent
Child
Caregiver
Supervisor

Calendar
Regular looking calendar like google calendar iphone app. (default week view of current)
The month name and last 2 digits of the year is always shown at the top. and can be clicked on to change the month and year.
Selector in the top left for month, week or day view."
Swiping left or right will increase or decrees months of the month view, weeks in the week view or days on the day view. This needs to be 40% of the screen swipe and will have a springy animation.
All swipes up,down,left or right only happen 1 at a time with the direction the swipe started being the swipe action taking place. e.g if i was to start swiping down and them move my finger left without taking it off the screen the only swiping action/movement  that would take place is the up and down movement.
"+" button in the top right takes you to the Even type selection component
Editing a saved event will need other admin approval.
Each day in all the calendar view components has the events on the right as boxes corresponding to the times the event is on. it cannot be less than 1 pixel high.
Each day in all the calendar view components has coloured lines on the left showing the children and the member or other responsible for them at that time.
Each line is the members icon colour.
The lines will always take up the left half of the day. with no gap between a child and responsibility line. But there is a small gap between each child and responsibility parring. This means the lines will get thinner and wider depending on how many different children and people or "other" are responsible for them.
Each day shows the full day from 12am at the top to 11:59pm at the bottom line form. It is the timeline that the coloured lines are along. 
The current day is highlighted in every view. 

ExampleA: Child (red) is with Mum (blue) the entire week. The only "child responsibility event" starts at Tuesday 12pm (noon) when Dad (green) starts to be responsible for them. This event ends on Wednesday at 4pm when Mum takes back responsibility. When looking both Tuesday and Wednesday in any view the fist 1/4 from left to right is a Red line representing the child. On the Tuesday half way down the day the second line changes from blue to green as the responsibility changed from Mum to Dad at noon. On the Wednesday the second line changes from green back to blue about 16/24ths down the day. as the responsibility changed from Dad to Mum at 4pm.

ExampleB: Child1 (red), Child2 (yellow) start the day with Dad (green). They both go to school (purple) at 8am. At 2pm Child1 is picked up by mum (blue) for a doctor's appointment. at 3pm Child2 goes to after school care (pink). at 4pm Child2 is picked up by mum and both children spend the night with mum. Because there are 2 children the first line is red (Child1) and the 3rd is yellow (Child2) the entire day. The 2nd line is the person or "other" responsible for child1 and the 4th line is the person or "other" responsible for child2. So the 2nd line is green till 8/24ths down the day where it changes to purple. 14/24ths down it changes to Blue for the rest of the day. The 4th line is green till 8/24ths down the day where it changes to purple. 15/24ths down it changes to pink. 16/24ths down it changes to Blue for the rest of the day.

Child and responsibility line pop up component
Taping on a line will bring up a pop up rectangle the colour of the line with start time at the top, the end time a the bottom and the name of the child or responsibility as well as the member icon in the middle.
An edit button on the top right will take you the corresponding "Create child responsibility event component" in edit mode.
tapping again on the pop up would make it disappear.

Calendar Day View component
One day is shown with the date in the top left and M,TU,W,TH,F,SA,SU above the dates.
24hrs is a scrollable / up and down swipe-able section that is about 250% the height of the component space. Each hour is on the left most side, 1am, 2am, 3 am and so on till 11pm. 12am is not shown at eather the top or the bottom. The main calendar space that has the child and responsibility lines takes and events takes up all the space the hour text dosn't and has a background of horizontal lines for each hour, the hours text taking up the left 20%. 
Long pressing on an hr in this view with first highlight that hr and then open "Even type selection component" to create an even or child responsibility event and pass thin info to prefill the start time and end time 1hr after the start time.

Calendar Week View component
Day and week view look alike with the up and down scrollable day with the hours on the left. The weak view makes the hours text only take up 10% of the left side of the component. and there are now vertical lines in the background between each day. 
One week is shown with the dates along the top and M,TU,W,TH,F,SA,SU above the dates.
Long pressing on an hr in this view with first highlight that hr and then open "Even type selection component" to create an even or child responsibility event and pass thin info to prefill the start time and end time 1hr after the start time.

Calendar Month view component
Long pressing on an day in this view with first highlight that hr and then open "Even type selection component" to create an event or child responsibility event and pass thin info to prefill the start time as the current time to the last hour and end time 1hr after the start time.
Short pressing on a day in the month view will take you to the "Calendar Day View component"
M,TU,W,TH,F,SA,SU across the top. 
Then a grid taking up the maximum amount of space full width. The grid is 7 left to right (columns) for each day of the week and 6 down (rows) making more than enough days for each month. The 1st of the month is always on the first row on the right day of the week.
Unlike the week and day view the Child and responsibility lines are at the top running left to right of each day and are unbroken between days. but they work in the same way. showing a timeline for each child and responsibility line pairing.
The events in the month view take up the bottom half of each day. 

Even type selection component
2 buttons: Create event (go to "Create event component") or Create child responsibility event (go to "Create child responsibility event component")

Create event component
This is for normal event and do not involve a child or children
Even title
Start time and date (nice in for selecting this) if a day or time is selected it is prefilled
End time and date (nice in for selecting this) default to 1 hr after start time date
Member attending. Scrollable list with all group members
Repeating even options. repeat every x number of day, week, month, year. until date time. Note editing an event that is part of a repeating event will ask if they want to update all events going forward from this event.
Note field for all other info. 

Create child responsibility event component

**CRITICAL: Responsibility events CANNOT overlap - validation required**
- When creating/editing responsibility event, check for overlaps with existing events for same child
- If overlap detected, show error: "This conflicts with existing event [EVENT NAME] from [TIME] to [TIME]"
- User must resolve conflict (edit existing event or choose different time)
- Rationale: Clear accountability - one person responsible for each child at any given time
- Prevents custody disputes and scheduling conflicts

Even title
Select the children that this responsibility even applies to. scrollable list with all children in group, checkboxes for selecting multiple.
Start time and date (nice in for selecting this) if a day or time is selected it is prefilled
End time and date (nice in for selecting this) default to 1 hr after start time date
"Responsability selector slider component" start of event
"Responsability selector slider component" end of event
The option that change based on what is selected on the "Responsability selector slider component" 
Repeating even options. repeat every x number of day, week, month, year. until date time. Note editing an event that is part of a repeating event will ask if they want to update all events going forward from this event.
Note field for all other info. 
Buttons at the bottom. Save (if new), Request update (is changes made in edit mode), Request delete (if in edit mode)

Responsibility selector slider component
A slider with 4 othions
No change: (With the member icon above) Note: this will look at the start time and who is responsible for the child/ children on the calendar already.
Change to what is on the calendar already: (With the member icon above) Note: this will look at the end time and who is responsible for the child/ children on the calendar already.
Change of responsibility to members: Select responsible people. scrollable list with all Parents and Caregivers.
Change of responsibility to "other": first a list with a "new" button at the top and then all the past created others. if new there will be 3 options just like the "Member icons" full name, icon letters and colour selector

All Finance matters list
2 lists of "Finance matter list card"
Unsettled Finance matter
Settled Finance matters 
If people have a role with the ability to create a Finance matters they see a "Create" button on the top right
Settled matters can be changed to unsettled by the creator or and admin.

Create Finance matters component
This component will also be used when editing a Finance matter.
After submitting editing a Finance matter will need more than 50% of admins approval.
Ability to add and remove people involved in the Finance matter
Enter and Edit the total amount and what percentage or amount in the denomination each person should pay. up to 100% total. 
Edit the amount each person has paid in the denomination.
submit button. notification sent to all people involved

Finance matter list card
The "Finance matter list card" has the name of the finance matter group in the top left.
Top right pin button
Below the group name it has the icons of all the members of that Finance matter. 

Finance matter
It's just like a message thread but with 
Top right is setting of the Finance matter. setting only shows to the creator of the Finance matter and admins. Changes to any Finance matter need to be approved by more the %50 of admins. And is done on a pre filled Create Finance matters component. 
has a "Finance matter description component" that show up when the "info" button is clicked
User don't have the ability to leave
Top lets is a "Report payment" button. This will bring up the "Report payment component". When a Payment has been reported an approval is sent to the listed "member payed to" to confirm that it has been received.
Top of the page is also a "Mark as settled" Button. (If this is done by the creator of the finance matter it is marked as settled straight away. otherwise an approval notification in sent to the creator of the finance matter)
All actions like unsettled ,settled, a report of payment are logged as messages by the person that did the action 
Example a "report of payment" message will say @"members name" has reported making a payment of {amount with denomination} to @"member payed to" and then the receipt image is posted for anyone to view. and a time stamp
Example on approval of payment received a message will say @"member payed to" has confirmed resiving the payment of {amount with denomination} from @"members name".  and a time stamp. This will also update the Finance matters info. taking the amount away from the amount the members that received the payment needs to pay and adding it to the member that sent the money.

Example of Finance matter:  Member A makes a payment for kids shoes. They make a Finance matter adding Member B asking them to pay for half. The expected bars show %50 for both members. The currently paid show Member A %100 and Member B %0. Member B transfers %50 to Member A and makes a "report of payment" attracting the recipe image. Member A confirms the payment when they see the money in their back account. The currently paid info updates to %50 to both members. The Finance matter can be closed without problems.

Finance matter description component
"close" button top right
The name at the top
A description
The total amount need or spent
As many "Finance matter description bar component" showing the amount expected to be paid by each member.
The due date (optional)
As many "Finance matter description bar component" showing the the amount currently paid by each member.

Finance matter description bar component
This bar fills horizontally
Has a members Icon
Has a amount with the groups denomination
The bar is filed with the members icon colour to the percentage (up to 100%) that is passed to if from it's parent. (If it's an "expected" bar it will be %100. If it is the "currently paid" bar it will be the % of the expected amount that is confirmed to be paid. If someone has already paid )

Report payment component
This is just a form asking for the amount paid and an image of the receipt of payment and the member payed to.

**CRITICAL: Cannot report overpayment - validation required**
- System validates: payment amount ≤ amount owed by paying member
- If overpayment attempted, show error: "Payment amount ($X) exceeds what you owe ($Y). Please enter $Y or less."
- Rationale: Prevents accounting confusion and disputes
- Workaround: If overpaid by mistake, create separate finance matter requesting refund
- Example: Owe $50 but paid $100 → Create new finance matter "Overpayment refund - $50" where other person owes you $50

---

Gift Registry

**Purpose**: Allow group members to create shareable gift registries (wishlists) for birthdays, holidays, etc.

**Access Control**:
- Visible to group members based on admin settings (Feature Visibility Controls)
- Any member who can see this feature can create unlimited registries
- Only registry creator and admins can edit/delete registries
- Only registry creator and admins can add/remove gifts from a registry

**Registry Creation**:
- User creates a new registry with a name (e.g., "Sarah's Birthday 2025", "Christmas Wishlist")
- User selects sharing method:
  1. **Public with link** - Anyone with the link can view (no authentication required)
  2. **Link with passcode** - Anyone with link + 6-digit passcode can view
  3. **Group only** - Only accessible via app to members of this group
- System generates:
  - Unique shareable web URL (e.g., familyhelperapp.com/registry/abc123xyz)
  - 6-digit passcode (if passcode option selected, e.g., "482915")

**Registry Management** (Creator + Admins only):
- View/copy shareable web link (available repeatedly, not one-time use)
- Reset passcode (generates new random 6-digit code)
- Edit registry name
- Delete registry (permanently removes registry and all gifts)
- Add/remove gifts to registry

**Gift Structure**:
Each gift has:
- **Title/Name** (required) - e.g., "LEGO Star Wars Set"
- **Link** (optional) - URL to product page
- **Photo** (optional) - Upload image or fetch from URL
- **Cost** (optional) - Price in group's currency
- **Description** (optional) - Long text description, notes, size preferences, etc.

**Registry List View** (Mobile App):
- Shows all registries created by current user
- Shows all registries created by others in the group (if group-only)
- Each registry card displays:
  - Registry name
  - Creator name
  - Number of gifts
  - Sharing type (Public/Passcode/Group Only)
  - Share button (opens share sheet with web link)
- "Create Registry" button in top right

**Registry Detail View** (Mobile App):
- Registry name at top
- Creator name and sharing settings
- List of gifts as cards showing:
  - Photo thumbnail (if available)
  - Title
  - Cost (if provided)
  - Short description preview
- Tap gift to see full details
- Edit/Delete buttons (creator + admins only)
- Share button to get web link

**Add/Edit Gift Screen** (Creator + Admins only):
- Text field: Gift title (required)
- Text field: Link (optional, validated URL)
- Image picker: Photo (optional, upload from device or camera)
- Number field: Cost (optional, currency auto-detected from group settings)
- Multiline text: Description (optional, up to 500 characters)
- Save/Cancel buttons

**Public Web View** (External visitors):
- Clean, mobile-responsive web page at familyhelperapp.com/registry/{id}
- If passcode required: Show 6-digit input screen first
- Registry name and creator first name only (privacy)
- Grid of gift cards showing:
  - Photo (if available)
  - Title
  - Link button (if provided)
  - Cost (if provided)
  - Description (if provided)
- No edit capabilities (read-only for external viewers)
- "Powered by Family Helper" footer with link to sign up

**Integration with Secret Santa**:
- Gift registries will be used in Secret Santa feature
- Secret Santa participants can link to their gift registry
- Secret Santa gift-giver can view recipient's registry anonymously

**Database Structure** (high-level):
```
gift_registries table:
  - registry_id (UUID, primary key)
  - group_id (UUID, foreign key)
  - creator_id (UUID, foreign key to group_members)
  - name (VARCHAR)
  - sharing_type (ENUM: public, passcode, group_only)
  - passcode (VARCHAR, nullable, 6 digits)
  - web_token (VARCHAR, unique, for URL)
  - created_at, updated_at

gift_items table:
  - item_id (UUID, primary key)
  - registry_id (UUID, foreign key)
  - title (VARCHAR, required)
  - link (TEXT, nullable)
  - photo_url (TEXT, nullable)
  - cost (DECIMAL, nullable)
  - description (TEXT, nullable)
  - created_at, updated_at
```

**Security Considerations**:
- Web tokens must be cryptographically random (not sequential IDs)
- Passcodes are stored in plain text (they're not security-critical, just convenience)
- Rate limiting on public web view to prevent scraping
- No authentication required for public/passcode links (by design)
- Group-only registries require app authentication

**Example User Flows**:

**Flow 1: Creating a public registry**
1. User taps "Gift Registry" from group dashboard
2. Taps "Create Registry" button
3. Enters name: "Emma's 10th Birthday"
4. Selects "Public with link"
5. Taps "Create"
6. System generates: familyhelperapp.com/registry/x7k9m2p
7. User adds gifts: "Nintendo Switch", "Pokemon Cards", "Art Supplies"
8. User shares link via text message to grandparents

**Flow 2: Viewing a passcode-protected registry**
1. Grandma receives link: familyhelperapp.com/registry/a3b9z1x
2. Opens link in browser
3. Sees: "Enter passcode to view Emma's registry"
4. Enters: 482915
5. Views gift list with photos and links
6. Clicks Amazon link for Nintendo Switch

---

PH Messenger - Companion App

PH Messenger is a lightweight companion app that provides messaging-only functionality. It is designed for:
- Children with restricted phones who only need messaging
- Non-technical users who don't need admin features
- Quick access to family messaging without complex navigation

Key Features:
- No login required on app open (uses device biometric authentication - Face ID, Touch ID, or PIN)
- Opens directly to message groups list
- Only shows message groups the user is a member of
- Full message functionality: send text, images, videos, @mentions
- Real-time sync with main Family Helper app
- Notification badges for unread messages and @mentions
- Users can create message groups (if their role allows)
- Cannot access: Calendar, Finance, Admin settings, Group settings

Authentication Flow:
1. First time: User logs in with Kinde (email + MFA)
2. App securely stores authentication token
3. Subsequent opens: Device biometric (Face ID/Touch ID) verifies identity
4. Token refreshed in background
5. If biometric fails 3 times: Requires Kinde re-authentication

Technical Implementation:
- Same backend API as main app (only messaging endpoints)
- Same database (messages table)
- Shared React Native components for messaging UI
- Separate Expo app with minimal navigation
- Redux store with only message-related state
- Expo SecureStore for token storage
- Expo Local Authentication for biometric

Permissions:
- All roles can use PH Messenger EXCEPT Supervisors (they cannot send messages)
- Message permissions follow the same rules as main app
- Admins can still see hidden messages (greyed out)
- All actions logged to audit_logs table with app identifier

Use Cases:
- Parent locks down child's phone to only allow PH Messenger
- Child can message parents, siblings, caregivers within approved groups
- Parent monitors communication via admin logs in main app
- Grandparent who only wants to message family, not manage calendar/finance

---

User Cases

UC1:
I use a group for family management and communication for everything to do with my first wife and our 2 kids.
membership is me and my ex-wife as the parents both admins. our children, Their grandparents, aunts and uncles as caregivers.


UC2:
Parents have locked down the phones of their children so that the children can only use PH Messenger to message people.
Children without a restricted phone can use either the main Family Helper app or PH Messenger.
Admins can monitor the children's conversations via audit logs in the main app.
The level of privacy of the children can be discussed and managed by the parents.
Message groups can be setup for all the individual connections between children or children can have access to create new message groups including anyone in the group.
Children see the same messages whether they use PH Messenger or the main app - they are fully synced.  