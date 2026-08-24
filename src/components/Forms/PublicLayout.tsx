import { Outlet } from "react-router-dom";
import Navbar from "../Forms/HomeNavbar";

export default function PublicLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}