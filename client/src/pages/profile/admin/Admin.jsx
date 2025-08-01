import React, { useState } from "react";
import AdminProfile from "./sections/AdminProfile";
import AgencyRequests from "./sections/AgencyRequests";
import AdminState from "../../../state/AdminState";

export default function Admin() {
  const [section, setSection] = useState("profile");
  const { selectedPortion, setSelectedPortion } = AdminState();

  const renderSection = () => {
    switch (section) {
      case "profile":
        return <AdminProfile />;
      case "requests":
        return <AgencyRequests />;
      default:
        return <AdminProfile />;
    }
  };

  return (
    <div className="block md:flex min-h-screen bg-gray-50">
      <aside className="w-full md:w-60 bg-white shadow-lg p-4 ">
        <h2 className="text-xl font-bold mb-6 text-center">Admin Panel</h2>
        <div className="flex md:block">
          <button
            onClick={() => {
              setSection("profile");
              setSelectedPortion("profile");
            }}
            className={`block w-full  py-1 cursor-pointer ${
              selectedPortion === "profile" ? "bg-gray-300" : "bg-gray-100"
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => {
              setSection("requests");
              setSelectedPortion("requests");
            }}
            className={`block w-full  py-1 cursor-pointer ${
              selectedPortion === "requests" ? "bg-gray-300" : "bg-gray-100"
            }`}
          >
            Agency Requests
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 md:h-[90vh] md:overflow-scroll">
        {renderSection()}
      </main>
    </div>
  );
}
