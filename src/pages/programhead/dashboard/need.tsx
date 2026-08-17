/*
programHead/
│
├── Dashboard/
│   ├── Dashboard.tsx
│   └── Dashboard.css
│
├── GradeApproval/
│   ├── PendingGrades.tsx
│   ├── GradeDetails.tsx
│   ├── ApprovedGrades.tsx
│   ├── RejectedGrades.tsx
│   └── GradeApproval.
│
├── FacultyAvailability/
│   ├── FacultyList.tsx
│   ├── FacultyWorkload.tsx
│   ├── FacultySchedule.tsx
│   └── FacultyAvailability.
│
├── ScheduleVerification/
│   ├── ScheduleList.tsx
│   ├── ScheduleDetails.tsx
│   ├── ConflictChecker.tsx
│   ├── VerifiedSchedules.tsx
│   └── ScheduleVerification.css
│
├── ProgramReports/
│   ├── ReportDashboard.tsx
│   ├── EnrollmentReport.tsx
│   ├── FacultyLoadReport.tsx
│   ├── GradeApprovalReport.tsx
│   ├── ScheduleReport.tsx
│   └── ProgramReports.css
│
└── Profile/
    ├── Profile.tsx
    ├── ChangePassword.tsx
    └── Profile.

------------------------------------------------------------------------------------------------

Dashboard
Dashboard/
│
├── Dashboard.tsx

Contains:

Program Head overview
Pending grade approvals
Faculty workload summary
Schedule conflicts
Quick statistics
Recent announcements

-------------------------------------------------------------------------------------------------------------


GradeApproval
GradeApproval/
│
├── PendingGrades.tsx
├── GradeDetails.tsx
├── ApprovedGrades.tsx
├── RejectedGrades.tsx
PendingGrades

Shows all grades waiting for approval.

Example columns:

Student
Subject
Faculty
Semester
Status

Actions:

View
Approve
Reject
GradeDetails

Displays:

Student Information
Subject
Grade
Computation
Remarks

Buttons:

Approve
Reject
Back
ApprovedGrades

History of approved grades.

RejectedGrades

History of rejected grades with remarks.

-----------------------------------------------------------------------------------------------------

FacultyAvailability
FacultyAvailability/
│
├── FacultyList.tsx
├── FacultyWorkload.tsx
├── FacultySchedule.tsx
FacultyList

Displays:

Faculty Name
Department
Status
FacultyWorkload

Displays:

Teaching Units
Subjects
Remaining Load
FacultySchedule

Displays weekly teaching schedules.
----------------------------------------------------------------------------------------------------------

ScheduleVerification
ScheduleVerification/
│
├── ScheduleList.tsx
├── ScheduleDetails.tsx
├── ConflictChecker.tsx
├── VerifiedSchedules.tsx
ScheduleList

Displays all submitted schedules.

ScheduleDetails

Shows:

Subject
Faculty
Room
Time
Students
ConflictChecker

Automatically detects:

Faculty conflict
Room conflict
Time conflict
VerifiedSchedules

Shows schedules already approved.


----------------------------------------------------------------------------------------

ProgramReports
ProgramReports/
│
├── ReportDashboard.tsx
├── EnrollmentReport.tsx
├── FacultyLoadReport.tsx
├── GradeApprovalReport.tsx
├── ScheduleReport.tsx
ReportDashboard

Landing page for reports.

EnrollmentReport

Displays:

Number of students
Program
Year level
FacultyLoadReport

Displays faculty teaching loads.

GradeApprovalReport

Displays:

Pending
Approved
Rejected
ScheduleReport

Displays:

Room utilization
Faculty schedules
Subject schedules
----------------------------------------------------------------------------------------------

    Profile
Profile/
│
├── Profile.tsx
├── ChangePassword.tsx

Allows the Program Head to:

View personal information
Update contact information
Change password

-------------------------------------------------------------------------------------------------   

Suggested Sidebar Navigation

Dashboard

Academic Management
    • Grade Approval
    • Faculty Availability
    • Schedule Verification

Reports
    • Program Reports

Account
    • Profile
    
    
    */
