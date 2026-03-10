import React, { useState } from "react";

type Props = {
  setShowRegister: (value: boolean) => void;
};

export default function RegistrationForm({ setShowRegister }: Props) {
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
    verifyPassword: "",
  });

  const [error, setError] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.email || !formData.username || !formData.password) {
      setError("Please fill all fields");
      return;
    }

    if (formData.password !== formData.verifyPassword) {
      setError("Passwords do not match!");
      setFormData({ ...formData, password: "", verifyPassword: "" });
      return;
    }

    setError("");
    console.log("Registering user...", formData);
    // Call your API here
  }

  return (
    <div className="registration-form">
      <h1>Register</h1>

      <form onSubmit={handleSubmit}>
        {["email", "username", "password", "verifyPassword"].map((field) => (
          <div key={field}>
            <label>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
            <input
              type={field.includes("password") ? "password" : "text"}
              name={field}
              value={(formData as any)[field]}
              onChange={handleChange}
              required
            />
          </div>
        ))}

        {error && <p style={{ color: "red" }}>{error}</p>}

        <button type="submit">Register</button>
      </form>

      <p>
        Already have an account?{" "}
        <span
          style={{ color: "blue", cursor: "pointer" }}
          onClick={() => setShowRegister(false)}
        >
          Go back to Login
        </span>
      </p>
    </div>
  );
}
