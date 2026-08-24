import "../../styles/infoPages.css";

export default function Contact() {
  return (
    <section className="infoPage">

      <div className="infoContent">

        {/* INTRODUCTION */}
        <div className="infoHero">

          <p className="eyebrow">
            GET IN TOUCH
          </p>

          <h2>
            We are here to help
          </h2>

          <p>
            Have questions about admission, programs, or the
            student portal? Contact PTC through the information
            below.
          </p>

        </div>

        {/* CONTACT INFORMATION */}
        <div className="contactGrid">

          <article className="contactCard">

            <span>📍</span>

            <h3>
              Campus
            </h3>

            <p>
              Pateros Technological College
            </p>

            <p>
              Pateros, Metro Manila, Philippines
            </p>

          </article>

          <article className="contactCard">

            <span>✉️</span>

            <h3>
              Email
            </h3>

            <p>
              Contact the PTC office through its official email
              channels for admission and student concerns.
            </p>

          </article>

          <article className="contactCard">

            <span>📞</span>

            <h3>
              Phone
            </h3>

            <p>
              Contact the PTC office during official school hours
              for inquiries and assistance.
            </p>

          </article>

        </div>

      </div>

    </section>
  );
}