import DashboardLayout from "../../../components/Layout/DashboardLayout";
import { authService } from "../../../services/auth.service";
import { useNavigate } from "react-router-dom";
import { useRef, useState, useEffect } from "react";
import "../../../styles/StudentSchedule.css";

import FullCalendar from "@fullcalendar/react";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

export default function StudentSchedule() {
  const navigate = useNavigate();
  const user = authService.getSession();

  const calendarRef = useRef<any>(null);

  const [currentMonth, setCurrentMonth] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());

  const [holidays, setHolidays] = useState<any[]>([]);
  const events = [
  {
    title: "Capstone",
    start: "2026-08-10",
    color: "#2563eb",
  },
  {
    title: "Networking",
    start: "2026-08-13",
    color: "#cadd1b",
  },
  {
    title: "Database",
    start: "2026-08-18",
    color: "#46e21f",
  },
];
  
useEffect(() => {
    fetch("https://date.nager.at/api/v3/PublicHolidays/2026/PH")
        .then((response) => response.json())
        .then((data) => {
            setHolidays(data);
        })
        .catch((error) => {
            console.error(error);
        });
}, []);

const currentMonthHolidays = holidays.filter((holiday) => {
    const holidayDate = new Date(holiday.date);

    return (
        holidayDate.getMonth() === currentDate.getMonth() &&
        holidayDate.getFullYear() === currentDate.getFullYear()
    );
});

const holidayEvents = holidays.map((holiday) => ({
    title: holiday.localName,
    start: holiday.date,
    className: "holiday-event",
}));

  if (!user || user.role !== "Student") {
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="student-schedule-page">

    {/* Page Header */}
    <div className="schedule-header">
        <h1>Student Schedule</h1>
        <h2>{currentMonth}</h2>
        <div className="month-navigation">
            <button
  onClick={() => {
    const api = calendarRef.current?.getApi();
    api.prev();
    setCurrentMonth(api.view.title);
    setCurrentDate(api.getDate());
  }}
>
  {"<"}
</button>

<button
  onClick={() => {
    const api = calendarRef.current?.getApi();
    api.today();
    setCurrentMonth(api.view.title);
    setCurrentDate(api.getDate());
  }}
>
  Today
</button>

<button
  onClick={() => {
    const api = calendarRef.current?.getApi();
    api.next();
    setCurrentMonth(api.view.title);
    setCurrentDate(api.getDate());
  }}
>
  {">"}
</button>
        </div>
    </div>

    {/* Calendar */}
    <div className="calendar-container">
        <h3>Monthly Calendar</h3>

        <FullCalendar
    ref={calendarRef}
    plugins={[dayGridPlugin, interactionPlugin]}
    initialView="dayGridMonth"
    headerToolbar={false}
    height="auto"
    events={[...events, ...holidayEvents]}
    datesSet={(info) => {
        setCurrentMonth(info.view.title);
    }}
/>
    </div>

    {/* Holidays */}
<div className="holiday-container">
    <h3>HOLIDAYS THIS MONTH</h3>

    {holidays.length === 0 ? (
    <p>Loading holidays...</p>
) : currentMonthHolidays.length === 0 ? (
    <p>No holidays this month.</p>
) : (
    <ul>
        {currentMonthHolidays.map((holiday) => (
            <li key={holiday.date}>
    <strong>
        {new Date(holiday.date).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
        })}
    </strong>
    {" — "}
    {holiday.localName}
</li>
        ))}
    </ul>
)}
</div>

    {/* Legend */}
    <div className="legend-container">
        <h3>Subject Legend</h3>

        <p>No subjects available.</p>
    </div>

</div>
    </DashboardLayout>
  );
}
