/**
 * Performance Monitor Utility
 * 
 * Provides tools for measuring and tracking performance metrics:
 * - Component render times
 * - API call durations
 * - Streaming performance
 * - Memory usage
 * 
 * In production, metrics can be sent to analytics services.
 * In development, metrics are logged to console.
 */

type MetricType = 'render' | 'api' | 'stream' | 'search' | 'session' | 'custom';

interface PerformanceMetric {
  name: string;
  type: MetricType;
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface PerformanceThresholds {
  render: number;     // ms - warn if render takes longer
  api: number;        // ms - warn if API call takes longer
  stream: number;     // ms - warn if streaming setup takes longer
  search: number;     // ms - warn if search takes longer
  session: number;    // ms - warn if session operations take longer
  custom: number;     // ms - default threshold
}

const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  render: 16,         // 60fps = 16ms per frame
  api: 3000,          // 3 seconds for API calls
  stream: 1000,       // 1 second for stream setup
  search: 2000,       // 2 seconds for search
  session: 500,       // 500ms for session operations
  custom: 1000,       // 1 second default
};

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private activeTimers: Map<string, number> = new Map();
  private thresholds: PerformanceThresholds;
  private enabled: boolean;
  private maxMetrics: number = 1000;
  
  constructor() {
    this.thresholds = { ...DEFAULT_THRESHOLDS };
    this.enabled = process.env.NODE_ENV === 'development' || 
                   process.env.NEXT_PUBLIC_ENABLE_PERF_MONITORING === 'true';
  }
  
  /**
   * Start timing an operation
   */
  start(name: string, type: MetricType = 'custom'): void {
    if (!this.enabled) return;
    
    const key = `${type}:${name}`;
    this.activeTimers.set(key, performance.now());
  }
  
  /**
   * End timing and record the metric
   */
  end(name: string, type: MetricType = 'custom', metadata?: Record<string, any>): number {
    if (!this.enabled) return 0;
    
    const key = `${type}:${name}`;
    const startTime = this.activeTimers.get(key);
    
    if (startTime === undefined) {
      console.warn(`[PerfMonitor] No start time found for: ${key}`);
      return 0;
    }
    
    const duration = performance.now() - startTime;
    this.activeTimers.delete(key);
    
    this.recordMetric({
      name,
      type,
      duration,
      timestamp: Date.now(),
      metadata,
    });
    
    return duration;
  }
  
  /**
   * Measure a function execution time
   */
  async measure<T>(
    name: string, 
    fn: () => Promise<T> | T, 
    type: MetricType = 'custom',
    metadata?: Record<string, any>
  ): Promise<T> {
    if (!this.enabled) {
      return fn();
    }
    
    this.start(name, type);
    try {
      const result = await fn();
      this.end(name, type, metadata);
      return result;
    } catch (error) {
      this.end(name, type, { ...metadata, error: true });
      throw error;
    }
  }
  
  /**
   * Record a metric directly
   */
  recordMetric(metric: PerformanceMetric): void {
    if (!this.enabled) return;
    
    // Add to metrics array
    this.metrics.push(metric);
    
    // Trim if exceeds max
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
    
    // Check threshold and warn if exceeded
    const threshold = this.thresholds[metric.type];
    if (metric.duration > threshold) {
      console.warn(
        `[PerfMonitor] Slow ${metric.type}: ${metric.name} took ${metric.duration.toFixed(2)}ms (threshold: ${threshold}ms)`,
        metric.metadata
      );
    } else if (process.env.NODE_ENV === 'development') {
      console.debug(
        `[PerfMonitor] ${metric.type}: ${metric.name} - ${metric.duration.toFixed(2)}ms`,
        metric.metadata
      );
    }
  }
  
  /**
   * Get metrics summary
   */
  getSummary(type?: MetricType): {
    count: number;
    totalDuration: number;
    avgDuration: number;
    maxDuration: number;
    minDuration: number;
    slowCount: number;
  } {
    const filtered = type 
      ? this.metrics.filter(m => m.type === type)
      : this.metrics;
    
    if (filtered.length === 0) {
      return {
        count: 0,
        totalDuration: 0,
        avgDuration: 0,
        maxDuration: 0,
        minDuration: 0,
        slowCount: 0,
      };
    }
    
    const durations = filtered.map(m => m.duration);
    const totalDuration = durations.reduce((a, b) => a + b, 0);
    const threshold = type ? this.thresholds[type] : this.thresholds.custom;
    
    return {
      count: filtered.length,
      totalDuration,
      avgDuration: totalDuration / filtered.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      slowCount: filtered.filter(m => m.duration > threshold).length,
    };
  }
  
  /**
   * Get recent metrics
   */
  getRecentMetrics(count: number = 50): PerformanceMetric[] {
    return this.metrics.slice(-count);
  }
  
  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.activeTimers.clear();
  }
  
  /**
   * Set custom thresholds
   */
  setThresholds(thresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }
  
  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  /**
   * Log a summary report to console
   */
  logReport(): void {
    if (!this.enabled) return;
    
    console.group('[PerfMonitor] Performance Report');
    
    const types: MetricType[] = ['render', 'api', 'stream', 'search', 'session', 'custom'];
    
    types.forEach(type => {
      const summary = this.getSummary(type);
      if (summary.count > 0) {
        console.log(`${type.toUpperCase()}:`, {
          count: summary.count,
          avg: `${summary.avgDuration.toFixed(2)}ms`,
          max: `${summary.maxDuration.toFixed(2)}ms`,
          min: `${summary.minDuration.toFixed(2)}ms`,
          slow: summary.slowCount,
        });
      }
    });
    
    console.groupEnd();
  }
}

// Singleton instance
export const perfMonitor = new PerformanceMonitor();

/**
 * React hook for component render performance
 */
export function useRenderPerformance(componentName: string): void {
  if (typeof window === 'undefined') return;
  
  const renderStartRef = React.useRef<number>(0);
  
  // Mark render start
  renderStartRef.current = performance.now();
  
  // Record after render
  React.useEffect(() => {
    const duration = performance.now() - renderStartRef.current;
    perfMonitor.recordMetric({
      name: componentName,
      type: 'render',
      duration,
      timestamp: Date.now(),
    });
  });
}

import React from 'react';

/**
 * HOC to measure component render performance
 */
export function withPerformanceTracking<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName: string
) {
  return function PerformanceTrackedComponent(props: P) {
    useRenderPerformance(componentName);
    return <WrappedComponent {...props} />;
  };
}

/**
 * Utility for timing async operations
 */
export async function timedAsync<T>(
  name: string,
  fn: () => Promise<T>,
  type: MetricType = 'custom'
): Promise<T> {
  return perfMonitor.measure(name, fn, type);
}

/**
 * Utility for timing sync operations
 */
export function timedSync<T>(
  name: string,
  fn: () => T,
  type: MetricType = 'custom'
): T {
  perfMonitor.start(name, type);
  try {
    const result = fn();
    perfMonitor.end(name, type);
    return result;
  } catch (error) {
    perfMonitor.end(name, type, { error: true });
    throw error;
  }
}

export default perfMonitor;
