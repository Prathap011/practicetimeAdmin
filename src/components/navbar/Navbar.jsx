import React from 'react';
import { useNavigate } from 'react-router-dom';
import "./Navbar.css";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/FirebaseSetup";
import { RxHamburgerMenu } from "react-icons/rx";

const Navbar = () => {
  const [showmenu, setShowmenu] = React.useState(false);
  const navigate = useNavigate();

  const handleHamburger = () => {
    setShowmenu(!showmenu);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("user");
      navigate("/");
      setShowmenu(false);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleNavigation = (path) => {
    navigate(path);
    setShowmenu(false);
  };

  return (
    <div className="wrapper">
      <h2 onClick={() => handleNavigation("/")}>PracticeTime.ai</h2>

      <nav className={showmenu ? "menu-mobile" : "menu-web"}>
        <ul>
          <li onClick={() => handleNavigation("/upload")}>Add Questions</li>
          <li onClick={() => handleNavigation("/all-questions")}>All Questions</li>
          <li onClick={() => handleNavigation("/attached-questions")}>Attached Questions</li>
          <li onClick={() => handleNavigation("/upload-multi")}>Add MultiQ</li>
          <li onClick={() => handleNavigation("/all-questions-set")}>All Questions Set</li>

          {/* ✅ New Tabs for Worksheet Generator */}
          <li onClick={() => handleNavigation("/worksheet-gen-manual")}>WorksheetGen-Manual</li>
          <li onClick={() => handleNavigation("/worksheet-gen-system")}>WorksheetGen-System</li>

          <li onClick={() => handleNavigation("/allUsers")}>All Users</li>
          <li onClick={() => handleNavigation("/admin-stats")}>Admin Stats</li>
          <li onClick={handleLogout}>Log out</li>
        </ul>
      </nav>

      <div className="hamburger">
        <button onClick={handleHamburger}>
          <RxHamburgerMenu />
        </button>
      </div>
    </div>
  );
};

export default Navbar;
