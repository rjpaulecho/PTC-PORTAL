// =====================================================
// SUMMARY TYPE
// =====================================================

export interface OfferingReadinessSummary {
  curriculum_subjects: number;

  section_subjects: number;

  missing_section_subjects: number;

  offerings: number;

  missing_offerings: number;

  open_offerings: number;

  closed_offerings: number;

  cancelled_offerings: number;

  configuration_complete: number;

  configuration_incomplete: number;

  ready_for_enrollment: number;

  not_ready: number;

  extra_or_special_section_subjects: number;
}

// =====================================================
// PROPS
// =====================================================

interface OfferingReadinessProps {
  ready: boolean;

  courseCode: string;

  sectionName: string;

  academicYear: string;

  semesterName: string;

  summary: OfferingReadinessSummary;
}

// =====================================================
// COMPONENT
// =====================================================

export default function OfferingReadiness({
  ready,

  courseCode,

  sectionName,

  academicYear,

  semesterName,

  summary,
}: OfferingReadinessProps) {
  // =====================================================
  // BASIC COUNTS
  // =====================================================

  const totalSubjects = Number(summary.curriculum_subjects || 0);

  const readyOfferings = Number(summary.ready_for_enrollment || 0);

  const missingSectionSubjects = Number(summary.missing_section_subjects || 0);

  const missingOfferings = Number(summary.missing_offerings || 0);

  const incompleteOfferings = Number(summary.configuration_incomplete || 0);

  const closedOfferings = Number(summary.closed_offerings || 0);

  const cancelledOfferings = Number(summary.cancelled_offerings || 0);

  // =====================================================
  // ALL REQUIRED OFFERINGS EXIST
  //
  // IMPORTANT:
  //
  // This is DIFFERENT from backend enrollment readiness.
  //
  // It only answers:
  //
  // "Has the Registrar already created every required
  // curriculum offering for this section?"
  //
  // TRUE means:
  //
  // 1. The curriculum contains at least one subject.
  // 2. No curriculum subject is missing a section_subject.
  // 3. No prepared section_subject is missing an offering.
  //
  // Offering status does NOT affect this creation check.
  //
  // Therefore:
  //
  // - Closed offering     = offering still exists
  // - Cancelled offering  = offering still exists
  //
  // Those statuses can prevent enrollment readiness, but
  // they must not make the UI claim that an offering has
  // never been created.
  // =====================================================

  const allRequiredOfferingsExist =
    totalSubjects > 0 && missingSectionSubjects === 0 && missingOfferings === 0;

  // =====================================================
  // OFFERING CREATION PROGRESS
  //
  // Backend missing_offerings only counts subjects that
  // already have a section_subject but have no offering.
  //
  // Subjects without a section_subject also cannot have a
  // normal curriculum offering yet, so subtract both.
  // =====================================================

  const subjectsWithOffering = Math.min(
    totalSubjects,
    Math.max(0, totalSubjects - missingSectionSubjects - missingOfferings),
  );

  const offeringSetupPercentage =
    totalSubjects > 0
      ? Math.min(
          100,
          Math.max(0, Math.round((subjectsWithOffering / totalSubjects) * 100)),
        )
      : 0;

  // =====================================================
  // ENROLLMENT READINESS PROGRESS
  //
  // `ready` and ready_for_enrollment come from the backend.
  // Frontend does not redefine the business readiness rule.
  // =====================================================

  const readinessPercentage =
    totalSubjects > 0
      ? Math.min(
          100,
          Math.max(0, Math.round((readyOfferings / totalSubjects) * 100)),
        )
      : 0;

  // =====================================================
  // SECTION VISUAL STATUS
  //
  // INCOMPLETE
  // - section_subject(s) still missing
  // - and/or offering(s) still missing
  //
  // COMPLETE
  // - all required offering records exist
  // - but backend says the section is not enrollment-ready
  //
  // READY
  // - backend readiness is true
  // =====================================================

  let sectionStatus: "ready" | "complete" | "incomplete" = "incomplete";

  if (ready) {
    sectionStatus = "ready";
  } else if (allRequiredOfferingsExist) {
    sectionStatus = "complete";
  }

  // =====================================================
  // COMPLETION LABEL
  // =====================================================

  let completionLabel = `${subjectsWithOffering}/${totalSubjects} OFFERINGS`;

  if (totalSubjects === 0) {
    completionLabel = "NO SUBJECTS";
  } else if (sectionStatus === "ready") {
    completionLabel = "ENROLLMENT READY";
  } else if (sectionStatus === "complete") {
    completionLabel = "ALL OFFERINGS CREATED";
  }

  // =====================================================
  // OFFERING CREATION MESSAGE
  // =====================================================

  let offeringCreationMessage = "✓ All required offerings exist";

  if (!allRequiredOfferingsExist) {
    if (missingSectionSubjects > 0 && missingOfferings > 0) {
      offeringCreationMessage = `${missingSectionSubjects} section subject${
        missingSectionSubjects === 1 ? "" : "s"
      } and ${missingOfferings} offering${
        missingOfferings === 1 ? "" : "s"
      } still missing`;
    } else if (missingSectionSubjects > 0) {
      offeringCreationMessage = `${missingSectionSubjects} section subject${
        missingSectionSubjects === 1 ? "" : "s"
      } must be prepared first`;
    } else if (missingOfferings > 0) {
      offeringCreationMessage = `${missingOfferings} still need offering${
        missingOfferings === 1 ? "" : "s"
      }`;
    } else if (totalSubjects === 0) {
      offeringCreationMessage =
        "No curriculum subjects found for this selected setup";
    }
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <section className="class-offering-section">
      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}

      <div className="class-offering-section-header">
        <div>
          <h2>Offering Readiness</h2>

          <p>
            {courseCode}
            {" • "}
            {sectionName}
            {" • "}
            {academicYear}
            {" • "}
            {semesterName}
          </p>
        </div>

        <span
          className={`class-offering-readiness-status ${
            ready ? "ready" : "not-ready"
          }`}
        >
          {ready ? "READY" : "NOT READY"}
        </span>
      </div>

      {/* ================================================= */}
      {/* SECTION COMPLETION BANNER */}
      {/* ================================================= */}

      <div className={`class-offering-section-completion ${sectionStatus}`}>
        {/* =============================================== */}
        {/* ICON */}
        {/* =============================================== */}

        <div className="class-offering-section-completion-icon">
          {sectionStatus === "incomplete" ? "!" : "✓"}
        </div>

        {/* =============================================== */}
        {/* TEXT */}
        {/* =============================================== */}

        <div className="class-offering-section-completion-content">
          {sectionStatus === "ready" && (
            <>
              <h3>Section Ready for Enrollment</h3>

              <p>
                All required class offerings for <strong>{sectionName}</strong>{" "}
                are configured, Open, and available for enrollment.
              </p>
            </>
          )}

          {sectionStatus === "complete" && (
            <>
              <h3>All Required Offerings Created</h3>

              <p>
                All <strong>{totalSubjects}</strong> required curriculum
                subjects for <strong>{sectionName}</strong> already have class
                offering records.
              </p>

              <small>
                Creation is complete, but the section is not enrollment-ready
                yet. Check configuration and offering/section-subject status
                below. Closed or Cancelled offerings still count as created
                records, but they are not enrollment-ready.
              </small>
            </>
          )}

          {sectionStatus === "incomplete" && (
            <>
              <h3>Offering Setup Incomplete</h3>

              {totalSubjects === 0 ? (
                <p>
                  No curriculum subjects were found for this selected academic
                  setup.
                </p>
              ) : (
                <p>
                  <strong>
                    {subjectsWithOffering}/{totalSubjects}
                  </strong>{" "}
                  required curriculum offerings currently exist for{" "}
                  <strong>{sectionName}</strong>. Prepare the remaining section
                  subjects and create their offerings.
                </p>
              )}
            </>
          )}
        </div>

        {/* =============================================== */}
        {/* CHECK LABEL */}
        {/* =============================================== */}

        <div className="class-offering-section-completion-label">
          {completionLabel}
        </div>
      </div>

      {/* ================================================= */}
      {/* SUMMARY GRID */}
      {/* ================================================= */}

      <div className="class-offering-summary-grid">
        {/* =============================================== */}
        {/* CURRICULUM */}
        {/* =============================================== */}

        <div
          className={`class-offering-summary-card ${
            totalSubjects === 0 ? "warning" : ""
          }`}
        >
          <span>Curriculum Subjects</span>

          <strong>{totalSubjects}</strong>

          <small>
            {totalSubjects > 0
              ? "Expected subjects for this curriculum term"
              : "No expected subjects found"}
          </small>
        </div>

        {/* =============================================== */}
        {/* SECTION SUBJECTS */}
        {/* =============================================== */}

        <div
          className={`class-offering-summary-card ${
            totalSubjects > 0 && missingSectionSubjects === 0
              ? "complete"
              : "warning"
          }`}
        >
          <span>Section Subjects</span>

          <strong>{summary.section_subjects}</strong>

          <small>
            {totalSubjects === 0
              ? "No curriculum subjects to prepare"
              : missingSectionSubjects === 0
                ? "✓ All section subjects prepared"
                : `${missingSectionSubjects} still missing`}
          </small>
        </div>

        {/* =============================================== */}
        {/* OFFERINGS CREATED */}
        {/* =============================================== */}

        <div
          className={`class-offering-summary-card ${
            allRequiredOfferingsExist ? "complete" : "warning"
          }`}
        >
          <span>Offerings Created</span>

          <strong>
            {subjectsWithOffering}/{totalSubjects}
          </strong>

          <small>{offeringCreationMessage}</small>
        </div>

        {/* =============================================== */}
        {/* READY */}
        {/* =============================================== */}

        <div
          className={`class-offering-summary-card ${
            readyOfferings === totalSubjects && totalSubjects > 0
              ? "complete"
              : readyOfferings > 0
                ? "info"
                : ""
          }`}
        >
          <span>Ready Offerings</span>

          <strong>{readyOfferings}</strong>

          <small>Open and completely configured</small>
        </div>

        {/* =============================================== */}
        {/* CLOSED */}
        {/* =============================================== */}

        <div
          className={`class-offering-summary-card ${
            closedOfferings > 0 ? "info" : ""
          }`}
        >
          <span>Closed</span>

          <strong>{closedOfferings}</strong>

          <small>Created but not currently open for enrollment</small>
        </div>

        {/* =============================================== */}
        {/* NOT READY */}
        {/* =============================================== */}

        <div
          className={`class-offering-summary-card ${
            Number(summary.not_ready || 0) > 0 ? "warning" : "complete"
          }`}
        >
          <span>Not Ready</span>

          <strong>{Number(summary.not_ready || 0)}</strong>

          <small>Subjects not currently available for enrollment</small>
        </div>
      </div>

      {/* ================================================= */}
      {/* OFFERING CREATION PROGRESS */}
      {/* ================================================= */}

      <div className="class-offering-readiness-progress">
        <div className="class-offering-progress-header">
          <span>Required Offerings Created</span>

          <strong>
            {subjectsWithOffering}/{totalSubjects} ({offeringSetupPercentage}%)
          </strong>
        </div>

        <div className="class-offering-progress-track">
          <div
            className={`class-offering-progress-value ${
              allRequiredOfferingsExist ? "complete" : ""
            }`}
            style={{
              width: `${offeringSetupPercentage}%`,
            }}
          />
        </div>
      </div>

      {/* ================================================= */}
      {/* ENROLLMENT READINESS PROGRESS */}
      {/* ================================================= */}

      <div className="class-offering-readiness-progress">
        <div className="class-offering-progress-header">
          <span>Enrollment Readiness Progress</span>

          <strong>
            {readyOfferings}/{totalSubjects} ({readinessPercentage}%)
          </strong>
        </div>

        <div className="class-offering-progress-track">
          <div
            className={`class-offering-progress-value ${ready ? "ready" : ""}`}
            style={{
              width: `${readinessPercentage}%`,
            }}
          />
        </div>
      </div>

      {/* ================================================= */}
      {/* MISSING / PROBLEM DETAILS */}
      {/* ================================================= */}

      {!ready && (
        <div className="class-offering-readiness-details">
          <h3>Section is not ready for enrollment</h3>

          <div className="class-offering-readiness-detail-grid">
            {missingSectionSubjects > 0 && (
              <div className="class-offering-readiness-detail">
                <strong>{missingSectionSubjects}</strong>

                <span>Missing Section Subjects</span>
              </div>
            )}

            {missingOfferings > 0 && (
              <div className="class-offering-readiness-detail">
                <strong>{missingOfferings}</strong>

                <span>Missing Offerings</span>
              </div>
            )}

            {incompleteOfferings > 0 && (
              <div className="class-offering-readiness-detail">
                <strong>{incompleteOfferings}</strong>

                <span>Incomplete Offerings</span>
              </div>
            )}

            {closedOfferings > 0 && (
              <div className="class-offering-readiness-detail">
                <strong>{closedOfferings}</strong>

                <span>Closed Offerings</span>
              </div>
            )}

            {cancelledOfferings > 0 && (
              <div className="class-offering-readiness-detail">
                <strong>{cancelledOfferings}</strong>

                <span>Cancelled Offerings</span>
              </div>
            )}
          </div>

          {allRequiredOfferingsExist && (
            <small>
              ✓ Every required offering record already exists. Remaining issues
              are configuration or status issues, not missing offering records.
            </small>
          )}
        </div>
      )}

      {/* ================================================= */}
      {/* READY MESSAGE */}
      {/* ================================================= */}

      {ready && (
        <div className="class-offering-ready-message">
          <strong>✓ Class offering setup complete</strong>

          <span>
            All required subjects for {sectionName} are ready for enrollment.
          </span>
        </div>
      )}
    </section>
  );
}
