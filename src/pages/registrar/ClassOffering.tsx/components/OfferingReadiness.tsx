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
  // OFFERING SETUP COMPLETE
  //
  // This is DIFFERENT from enrollment readiness.
  //
  // It only means:
  //
  // 1. All curriculum subjects have section_subjects
  // 2. All required section subjects have offerings
  // 3. No required offering is cancelled
  //
  // Closed offerings are allowed here because the
  // Registrar may intentionally finish setup before
  // opening enrollment.
  // =====================================================

  const offeringSetupComplete =
    totalSubjects > 0 &&
    missingSectionSubjects === 0 &&
    missingOfferings === 0 &&
    cancelledOfferings === 0;

  // =====================================================
  // PROGRESS
  // =====================================================

  const readinessPercentage =
    totalSubjects > 0 ? Math.round((readyOfferings / totalSubjects) * 100) : 0;

  // =====================================================
  // OFFERING CREATION PROGRESS
  //
  // How many curriculum subjects already have an offering?
  // =====================================================

  const subjectsWithOffering = Math.max(
    0,
    totalSubjects - missingSectionSubjects - missingOfferings,
  );

  const offeringSetupPercentage =
    totalSubjects > 0
      ? Math.round((subjectsWithOffering / totalSubjects) * 100)
      : 0;

  // =====================================================
  // SECTION STATUS
  // =====================================================

  let sectionStatus: "ready" | "complete" | "incomplete" = "incomplete";

  if (ready) {
    sectionStatus = "ready";
  } else if (offeringSetupComplete) {
    sectionStatus = "complete";
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
                are configured and available for enrollment.
              </p>
            </>
          )}

          {sectionStatus === "complete" && (
            <>
              <h3>Offering Setup Complete</h3>

              <p>
                All <strong>{totalSubjects}</strong> required curriculum
                subjects for <strong>{sectionName}</strong> already have class
                offerings.
              </p>

              <small>
                The section is not enrollment-ready yet because some offerings
                may still be Closed or need configuration.
              </small>
            </>
          )}

          {sectionStatus === "incomplete" && (
            <>
              <h3>Offering Setup Incomplete</h3>

              <p>
                This section still has required subjects that need to be
                prepared or given a class offering.
              </p>
            </>
          )}
        </div>

        {/* =============================================== */}
        {/* CHECK LABEL */}
        {/* =============================================== */}

        <div className="class-offering-section-completion-label">
          {sectionStatus === "ready"
            ? "ENROLLMENT READY"
            : sectionStatus === "complete"
              ? "ALL OFFERINGS CREATED"
              : `${subjectsWithOffering}/${totalSubjects} OFFERINGS`}
        </div>
      </div>

      {/* ================================================= */}
      {/* SUMMARY GRID */}
      {/* ================================================= */}

      <div className="class-offering-summary-grid">
        {/* =============================================== */}
        {/* CURRICULUM */}
        {/* =============================================== */}

        <div className="class-offering-summary-card">
          <span>Curriculum Subjects</span>

          <strong>{summary.curriculum_subjects}</strong>

          <small>Expected subjects for this curriculum term</small>
        </div>

        {/* =============================================== */}
        {/* SECTION SUBJECTS */}
        {/* =============================================== */}

        <div
          className={`class-offering-summary-card ${
            missingSectionSubjects === 0 ? "complete" : "warning"
          }`}
        >
          <span>Section Subjects</span>

          <strong>{summary.section_subjects}</strong>

          <small>
            {missingSectionSubjects === 0
              ? "✓ All section subjects prepared"
              : `${missingSectionSubjects} still missing`}
          </small>
        </div>

        {/* =============================================== */}
        {/* OFFERINGS CREATED */}
        {/* =============================================== */}

        <div
          className={`class-offering-summary-card ${
            offeringSetupComplete
              ? "complete"
              : missingOfferings > 0
                ? "warning"
                : ""
          }`}
        >
          <span>Offerings Created</span>

          <strong>
            {subjectsWithOffering}/{totalSubjects}
          </strong>

          <small>
            {offeringSetupComplete
              ? "✓ All required offerings exist"
              : `${missingOfferings} still need offerings`}
          </small>
        </div>

        {/* =============================================== */}
        {/* READY */}
        {/* =============================================== */}

        <div
          className={`class-offering-summary-card ${
            readyOfferings === totalSubjects && totalSubjects > 0
              ? "complete"
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
            summary.not_ready > 0 ? "warning" : "complete"
          }`}
        >
          <span>Not Ready</span>

          <strong>{summary.not_ready}</strong>

          <small>Subjects not currently available for enrollment</small>
        </div>
      </div>

      {/* ================================================= */}
      {/* OFFERING SETUP PROGRESS */}
      {/* ================================================= */}

      <div className="class-offering-readiness-progress">
        <div className="class-offering-progress-header">
          <span>Class Offering Setup</span>

          <strong>
            {subjectsWithOffering}/{totalSubjects} ({offeringSetupPercentage}
            %)
          </strong>
        </div>

        <div className="class-offering-progress-track">
          <div
            className={`class-offering-progress-value ${
              offeringSetupComplete ? "complete" : ""
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
            {readyOfferings}/{totalSubjects} ({readinessPercentage}
            %)
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
