import React from "react";
import { render, screen } from "@testing-library/react";
import PortfolioPie from "@/components/PortfolioPie";

const mockPositions = [
  { symbol: "AAPL", weight: 0.45, value: 1850 },
  { symbol: "MSFT", weight: 0.35, value: 1435 },
  { symbol: "GOOGL", weight: 0.2, value: 820 },
];

describe("PortfolioPie", () => {
  it("renders without crashing", () => {
    const { container } = render(<PortfolioPie positions={mockPositions} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("shows all position symbols", () => {
    render(<PortfolioPie positions={mockPositions} />);
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.getByText("GOOGL")).toBeInTheDocument();
  });

  it("renders empty state for no positions", () => {
    render(<PortfolioPie positions={[]} />);
    // Should not throw; renders empty/placeholder
  });
});
