import Header from "./Header"
import Navbar from "./Navbar"
import Footer from "./Footer"
import StudentSidebar from "./StudentSidebar"

type Props = {
  children: React.ReactNode
}

export default function StudentLayout({ children }: Props) {
  return (
    <div className="d-flex flex-column min-vh-100">
      <Header />
      <Navbar />

      <div className="container-fluid flex-grow-1">
        <div className="row h-100">
          
          {/* Sidebar */}
          <div className="col-12 col-md-3 col-lg-2 p-0">
            <StudentSidebar />
          </div>

          {/* Main Content */}
          <div className="col p-4">
            {children}
          </div>

        </div>
      </div>

      <Footer />
    </div>
  )
}