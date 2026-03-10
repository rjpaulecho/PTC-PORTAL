export default function Footer() {
  return (
    <footer className="bg-dark text-light mt-auto">
      <div className="container-fluid py-4">
        <div className="row text-center text-md-start">
          
          {/* Portal Info */}
          <div className="col-12 col-md-4 mb-3">
            <h6 className="fw-bold">PTC Portal</h6>
            <p className="small mb-0">
              Online Admission, Scheduling, and Student Information System.
            </p>
          </div>

          {/* Quick Links */}
          <div className="col-12 col-md-4 mb-3">
            <h6 className="fw-bold">Quick Links</h6>
            <ul className="list-unstyled small">
              <li>Student Dashboard</li>
              <li>Admin Panel</li>
              <li>Contact Support</li>
            </ul>
          </div>

          {/* Contact */}
          <div className="col-12 col-md-4 mb-3">
            <h6 className="fw-bold">Contact</h6>
            <p className="small mb-0">
              Email: support@ptcportal.com <br />
              Phone: +63 912 345 6789
            </p>
          </div>

        </div>

        <hr className="border-secondary" />

        <div className="text-center small">
          © {new Date().getFullYear()} PTC Portal. All rights reserved.
        </div>
      </div>
    </footer>
  )
}