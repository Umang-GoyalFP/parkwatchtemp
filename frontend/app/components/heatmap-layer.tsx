"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Hotspot } from "../lib/types";

type HeatmapLayerProps = {
  hotspots: Hotspot[];
  selectedCellId: string | null;
  title?: string;
};

const BENGALURU_BOUNDS = {
  lat_min: 12.8,
  lat_max: 13.2,
  lon_min: 77.4,
  lon_max: 77.8,
};

export function HeatmapLayer({
  hotspots,
  selectedCellId,
  title = "Risk Heatmap",
}: HeatmapLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredRisk, setHoveredRisk] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 50;
    const mapWidth = width - padding * 2;
    const mapHeight = height - padding * 2;

    // Clear
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Create gradient heatmap
    const cellSize = 20;
    const gridCols = Math.ceil(mapWidth / cellSize);
    const gridRows = Math.ceil(mapHeight / cellSize);

    // Build grid data
    const grid: number[][] = Array(gridRows)
      .fill(null)
      .map(() => Array(gridCols).fill(0));

    hotspots.forEach((hotspot) => {
      const lat = hotspot.latitude;
      const lon = hotspot.longitude;

      const px =
        padding +
        ((lon - BENGALURU_BOUNDS.lon_min) /
          (BENGALURU_BOUNDS.lon_max - BENGALURU_BOUNDS.lon_min)) *
          mapWidth;
      const py =
        padding +
        mapHeight -
        ((lat - BENGALURU_BOUNDS.lat_min) /
          (BENGALURU_BOUNDS.lat_max - BENGALURU_BOUNDS.lat_min)) *
          mapHeight;

      if (
        px >= padding &&
        px <= padding + mapWidth &&
        py >= padding &&
        py <= padding + mapHeight
      ) {
        const col = Math.floor((px - padding) / cellSize);
        const row = Math.floor((py - padding) / cellSize);
        if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
          grid[row][col] = Math.max(grid[row][col], hotspot.obstruction_risk_score);
        }
      }
    });

    // Draw heatmap
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const risk = grid[row][col];
        if (risk === 0) continue;

        const alpha = risk / 100;
        let color = "rgba(34, 197, 94"; // Green
        if (risk > 70) {
          color = "rgba(220, 38, 38"; // Red
        } else if (risk > 50) {
          color = "rgba(249, 115, 22"; // Orange
        }

        ctx.fillStyle = `${color}, ${alpha * 0.6})`;
        ctx.fillRect(
          padding + col * cellSize,
          padding + row * cellSize,
          cellSize,
          cellSize
        );
      }
    }

    // Draw borders
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.strokeRect(padding, padding, mapWidth, mapHeight);

    // Axes
    ctx.fillStyle = "#64748b";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("77.4°E", padding + 20, height - 15);
    ctx.fillText("77.8°E", padding + mapWidth - 20, height - 15);
    ctx.textAlign = "right";
    ctx.fillText("12.8°N", padding - 15, padding + mapHeight + 5);
    ctx.fillText("13.2°N", padding - 15, padding + 5);

    // Legend
    const legendX = width - 200;
    const legendY = 20;
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillRect(legendX - 10, legendY, 190, 110);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX - 10, legendY, 190, 110);

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Risk Level", legendX, legendY + 18);

    const legend = [
      { color: "#22c55e", label: "Low (0-50)" },
      { color: "#f97316", label: "Medium (50-70)" },
      { color: "#dc2626", label: "High (70+)" },
    ];

    legend.forEach((item, idx) => {
      const y = legendY + 35 + idx * 22;
      ctx.fillStyle = item.color;
      ctx.fillRect(legendX + 5, y - 8, 12, 12);
      ctx.fillStyle = "#475569";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(item.label, legendX + 25, y + 2);
    });
  }, [hotspots]);

  return (
    <section className="heatmap-layer">
      <h3>{title}</h3>
      <p className="heatmap-subtitle">
        Color intensity shows parking violation risk across zones
      </p>
      <div className="heatmap-wrapper">
        <canvas
          ref={canvasRef}
          width={700}
          height={500}
          className="heatmap-canvas"
        />
      </div>

      <style jsx>{`
        .heatmap-layer {
          padding: 1.5rem;
          background: white;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .heatmap-layer h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.1rem;
          color: #1e293b;
        }

        .heatmap-subtitle {
          margin: 0 0 1rem 0;
          font-size: 0.85rem;
          color: #64748b;
        }

        .heatmap-wrapper {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          overflow: hidden;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 1rem;
        }

        .heatmap-canvas {
          max-width: 100%;
          height: auto;
          display: block;
        }
      `}</style>
    </section>
  );
}
