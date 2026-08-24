import "../../styles/infoPages.css";

const programs = [
  {
    title: "Bachelor of Science in Information Technology",
    description:
      "A technology-focused program covering programming, databases, networking, web development, and information systems.",
  },
  {
    title: "Bachelor of Science in Business Administration",
    description:
      "A business program that develops knowledge and skills in management, marketing, finance, and entrepreneurship.",
  },
  {
    title: "Teacher Education Programs",
    description:
      "Programs designed to develop future educators through professional knowledge, teaching skills, and practical experience.",
  },
];

export default function Programs() {
  return (
    <section className="infoPage">

      <div className="infoContent">

        {/* INTRODUCTION */}
        <div className="infoHero">

          <p className="eyebrow">
            ACADEMIC PROGRAMS
          </p>

          <h2>
            Choose a path for your future
          </h2>

          <p>
            Explore the programs offered through PTC and find an
            area that matches your interests, skills, and career
            goals.
          </p>

        </div>

        {/* PROGRAMS */}
        <div className="programGrid">

          {programs.map((program) => (
            <article
              className="programCard"
              key={program.title}
            >

              <div className="programIcon">
                PTC
              </div>

              <h3>
                {program.title}
              </h3>

              <p>
                {program.description}
              </p>

              <button type="button">
                Apply Now →
              </button>

            </article>
          ))}

        </div>

      </div>

    </section>
  );
}