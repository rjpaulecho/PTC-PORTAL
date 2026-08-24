import "../../styles/infoPages.css";

export default function About() {
  return (
    <section className="infoPage">

      <div className="infoContent">

        {/* INTRODUCTION */}
        <div className="infoHero">

          <p className="eyebrow">
            ABOUT US
          </p>

          <h2>
            Pateros Technological College
          </h2>

          <p>
            Pateros Technological College is committed to providing
            accessible, quality, and practical education that helps
            students prepare for their future careers and become
            productive members of society.
          </p>

        </div>

        {/* INFORMATION CARDS */}
        <div className="infoCards">

          <article>
            <h3>Our Mission</h3>

            <p>
              To provide students with relevant knowledge, skills,
              and values through quality and accessible education.
            </p>
          </article>

          <article>
            <h3>Our Vision</h3>

            <p>
              To develop competent, responsible, and innovative
              graduates who can contribute positively to their
              community.
            </p>
          </article>

          <article>
            <h3>Student Focused</h3>

            <p>
              We aim to create a learning environment where students
              can grow, explore their interests, and prepare for
              real-world opportunities.
            </p>
          </article>

        </div>

      </div>

    </section>
  );
}