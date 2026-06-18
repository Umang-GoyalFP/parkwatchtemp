"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Hotspot } from "../lib/types";

type HotspotMapProps = {
  hotspots: Hotspot[];
  selectedCellId: string | null;
  onSelect: (cellId: string) => void;
  title?: string;
};

const BENGALURU_BOUNDS = {
  lat_min: 12.8, lat_max: 13.2,
  lon_min: 77.4, lon_max: 77.8
};

export function HotspotMapEnhanced({
  hotspots,
  selectedCellId,
  onSelect,
  title = "Hotspot Risk Map"
}: HotspotMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredCellId, setHoveredCellId] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    const mapWidth = width - padding * 2;
    const mapHeight = height - padding * 2;

    // Clear canvas
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Draw map background with subtle grid
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(padding, padding, mapWidth, mapHeight);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 0.5;

    for (let i = 0; i <= 10; i++) {
      const x = padding + (mapWidth / 10) * i;
      const y = padding + (mapHeight / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + mapHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + mapWidth, y);
      ctx.stroke();
    }

    // Draw border
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.strokeRect(padding, padding, mapWidth, mapHeight);

    // Draw hotspots
    hotspots.forEach((hotspot) => {
      const lat = hotspot.latitude;
      const lon = hotspot.longitude;

      // Normalize coordinates to canvas
      const x = padding + ((lon - BENGALURU_BOUNDS.lon_min) / (BENGALURU_BOUNDS.lon_max - BENGALURU_BOUNDS.lon_min)) * mapWidth;
      const y = padding + mapHeight - ((lat - BENGALURU_BOUNDS.lat_min) / (BENGALURU_BOUNDS.lat_max - BENGALURU_BOUNDS.lat_min)) * mapHeight;

      // Skip if outside bounds
      if (x < padding || x > padding + mapWidth || y < padding || y > padding + mapHeight) return;

      const riskScore = hotspot.obstruction_risk_score;
      const size = 4 + (riskScore / 100) * 6;

      // Color by risk
      let color = "#84cc16"; // Low risk - green
      if (riskScore > 70) {
        color = "#ef4444"; // High risk - red
      } else if (riskScore > 50) {
        color = "#f97316"; // Medium - orange
      }

      // Draw circle
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Highlight selected
      if (hotspot.grid_cell_id === selectedCellId) {
        ctx.strokeStyle = "#1e40af";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, size + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Highlight hovered
      if (hotspot.grid_cell_id === hoveredCellId) {
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, size + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // Draw axes labels
    ctx.fillStyle = "#64748b";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("77.4°E", padding + 10, height - 10);
    ctx.fillText("77.8°E", padding + mapWidth - 10, height - 10);
    ctx.textAlign = "right";
    ctx.fillText("12.8°N", padding - 10, padding + mapHeight + 5);
    ctx.fillText("13.2°N", padding - 10, padding + 5);

    // Draw legend
    const legendX = width - 200;
    const legendY = 20;
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillRect(legendX - 10, legendY, 190, 90);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX - 10, legendY, 190, 90);

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Risk Level", legendX, legendY + 18);

    const legend = [
      { color: "#84cc16", label: "Low" },
      { color: "#f97316", label: "Medium" },
      { color: "#ef4444", label: "High" }
    ];

    legend.forEach((item, idx) => {
      const y = legendY + 30 + idx * 18;
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(legendX + 5, y - 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#475569";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(item.label, legendX + 18, y + 2);
    });

  }, [hotspots, selectedCellId, hoveredCellId]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const padding = 40;
    const mapWidth = canvas.width - padding * 2;
    const mapHeight = canvas.height - padding * 2;

    // Check which hotspot was clicked
    hotspots.forEach((hotspot) => {
      const lat = hotspot.latitude;
      const lon = hotspot.longitude;

      const hx = padding + ((lon - BENGALURU_BOUNDS.lon_min) / (BENGALURU_BOUNDS.lon_max - BENGALURU_BOUNDS.lon_min)) * mapWidth;
      const hy = padding + mapHeight - ((lat - BENGALURU_BOUNDS.lat_min) / (BENGALURU_BOUNDS.lat_max - BENGALURU_BOUNDS.lat_min)) * mapHeight;

      const distance = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
      if (distance < 12) {
        onSelect(hotspot.grid_cell_id);
      }
    });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const padding = 40;
    const mapWidth = canvas.width - padding * 2;
    const mapHeight = canvas.height - padding * 2;

    let found = false;
    hotspots.forEach((hotspot) => {
      const lat = hotspot.latitude;
      const lon = hotspot.longitude;

      const hx = padding + ((lon - BENGALURU_BOUNDS.lon_min) / (BENGALURU_BOUNDS.lon_max - BENGALURU_BOUNDS.lon_min)) * mapWidth;
      const hy = padding + mapHeight - ((lat - BENGALURU_BOUNDS.lat_min) / (BENGALURU_BOUNDS.lat_max - BENGALURU_BOUNDS.lat_min)) * mapHeight;

      const distance = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
      if (distance < 12) {
        setHoveredCellId(hotspot.grid_cell_id);
        found = true;
      }
    });

    if (!found) {
      setHoveredCellId(null);
    }
  };

  return (
    <section className="hotspot-map-enhanced" ref={containerRef}>
      <h3>{title}</h3>
      <p className="map-subtitle">
        Click to select hotspots. Size and color indicate risk score.
      </p>
      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={700}
          height={500}
          className="map-canvas"
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={() => setHoveredCellId(null)}
        />
      </div>
      {hoveredCellId && (
        <div className="hover-tooltip">
          <strong>{hoveredCellId}</strong>
          {hotspots.find(h => h.grid_cell_id === hoveredCellId)?.obstruction_risk_score.toFixed(1)} risk score
        </div>
      )}

      <style jsx>{`
        .hotspot-map-enhanced {
          padding: 1.5rem;
          background: white;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .hotspot-map-enhanced h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.1rem;
          color: #1e293b;
        }

        .map-subtitle {
          margin: 0 0 1rem 0;
          font-size: 0.85rem;
          color: #64748b;
        }

        .canvas-wrapper {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          overflow: hidden;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 1rem;
        }

        .map-canvas {
          cursor: crosshair;
          max-width: 100%;
          height: auto;
          display: block;
        }

        .hover-tooltip {
          position: fixed;
          background: #1e293b;
          color: white;
          padding: 0.5rem 0.75rem;
          border-radius: 4px;
          font-size: 0.85rem;
          pointer-events: none;
          z-index: 10;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
      `}</style>
    </section>
  );
}
