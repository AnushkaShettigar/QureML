import React from "react";
import QuantumNetwork from "./QuantumNetwork";
import FlowerLogo from "./components/FlowerLogo";
import "./Landing.css";

export default function Landing({ onSelectRole }) {
  return (
    <main className="qureml-viewport">
      <div className="qureml-scene">
        <img
          className="qureml-reference"
          src="/qureml-landing-reference.png"
          alt=""
          aria-hidden="true"
        />
        <span className="network-veil" aria-hidden="true" />
        <QuantumNetwork />

        <span className="source-flower-mask" aria-hidden="true" />
        <FlowerLogo className="pixel-flower" />

        <a
          className="portal-hitarea portal-hitarea--clinician"
          href="#clinician"
          onClick={(e) => {
            e.preventDefault();
            onSelectRole("user");
          }}
          aria-label="Open Clinician / User View"
        >
          <span className="source-icon-mask" aria-hidden="true" />
          <span className="portal-pixel-icon portal-pixel-icon--medical" aria-hidden="true">
            <span className="pixel-medical-cross" />
            <span className="pixel-medical-bed" />
            <span className="pixel-medical-beam" />
          </span>
          <span className="diagnostic-avatar diagnostic-avatar--clinician" aria-hidden="true">
            <span className="diagnostic-avatar-module" />
            <span className="diagnostic-avatar-body">
              <span className="diagnostic-avatar-visor" />
              <span className="diagnostic-avatar-medical-mark" />
              <span className="diagnostic-avatar-leg diagnostic-avatar-leg--left" />
              <span className="diagnostic-avatar-leg diagnostic-avatar-leg--right" />
            </span>
          </span>
          <span className="diagnostic-scan" aria-hidden="true" />
          <span className="scan-platform" aria-hidden="true" />
          <span className="scan-readout scan-readout--medical" aria-hidden="true">
            DIAGNOSTIC VERIFIED
          </span>
        </a>

        <a
          className="portal-hitarea portal-hitarea--admin"
          href="#administrator"
          onClick={(e) => {
            e.preventDefault();
            onSelectRole("admin");
          }}
          aria-label="Open Administrator View"
        >
          <span className="source-icon-mask" aria-hidden="true" />
          <span className="portal-pixel-icon portal-pixel-icon--security" aria-hidden="true">
            <span className="pixel-terminal-screen" />
            <span className="pixel-terminal-lock" />
            <span className="pixel-terminal-key" />
          </span>
          <span className="cyber-avatar" aria-hidden="true">
            <span className="cyber-avatar-pack">
              <span className="cyber-avatar-data cyber-avatar-data--one" />
              <span className="cyber-avatar-data cyber-avatar-data--two" />
            </span>
            <span className="cyber-avatar-body">
              <span className="cyber-avatar-visor">
                <span className="cyber-avatar-visor-scan" />
              </span>
              <span className="cyber-avatar-shield">
                <span className="cyber-avatar-lock" />
              </span>
              <span className="cyber-avatar-leg cyber-avatar-leg--left" />
              <span className="cyber-avatar-leg cyber-avatar-leg--right" />
            </span>
            <span className="cyber-avatar-pixel cyber-avatar-pixel--one" />
            <span className="cyber-avatar-pixel cyber-avatar-pixel--two" />
            <span className="cyber-avatar-pixel cyber-avatar-pixel--three" />
          </span>
          <span className="admin-scan" aria-hidden="true" />
          <span className="admin-scan-grid" aria-hidden="true" />
          <span className="scan-platform scan-platform--admin" aria-hidden="true" />
          <span className="scan-readout scan-readout--security" aria-hidden="true">
            IDENTITY VERIFIED
          </span>
        </a>
      </div>
    </main>
  );
}
