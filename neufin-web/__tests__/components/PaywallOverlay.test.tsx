import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import PaywallOverlay from "@/components/PaywallOverlay";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe("PaywallOverlay", () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    feature: "Swarm Analysis Report",
  };

  it("renders when open", () => {
    render(<PaywallOverlay {...defaultProps} />);
    expect(screen.getByText(/Swarm Analysis Report/i)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<PaywallOverlay {...defaultProps} isOpen={false} />);
    expect(
      screen.queryByText(/Swarm Analysis Report/i),
    ).not.toBeInTheDocument();
  });

  it("calls onClose when dismiss button clicked", () => {
    const onClose = jest.fn();
    render(<PaywallOverlay {...defaultProps} onClose={onClose} />);
    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows upgrade CTA", () => {
    render(<PaywallOverlay {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /upgrade/i }),
    ).toBeInTheDocument();
  });
});
