/**
 * Quadtree for spatial partitioning
 * Optimizes collision detection and nearest-neighbor queries from O(n²) to O(n log n)
 */

class Quadtree {
  constructor(bounds, capacity = 8, maxDepth = 6, depth = 0) {
    this.bounds = bounds; // { x, y, width, height }
    this.capacity = capacity;
    this.maxDepth = maxDepth;
    this.depth = depth;
    this.points = [];
    this.divided = false;
    this.northwest = null;
    this.northeast = null;
    this.southwest = null;
    this.southeast = null;
  }

  /**
   * Check if a point is within the bounds
   */
  contains(point) {
    return (
      point.x >= this.bounds.x &&
      point.x < this.bounds.x + this.bounds.width &&
      point.y >= this.bounds.y &&
      point.y < this.bounds.y + this.bounds.height
    );
  }

  /**
   * Check if bounds intersect with a range
   */
  intersects(range) {
    return !(
      range.x > this.bounds.x + this.bounds.width ||
      range.x + range.width < this.bounds.x ||
      range.y > this.bounds.y + this.bounds.height ||
      range.y + range.height < this.bounds.y
    );
  }

  /**
   * Subdivide this node into 4 children
   */
  subdivide() {
    const x = this.bounds.x;
    const y = this.bounds.y;
    const hw = this.bounds.width / 2;
    const hh = this.bounds.height / 2;

    this.northwest = new Quadtree(
      { x: x, y: y, width: hw, height: hh },
      this.capacity,
      this.maxDepth,
      this.depth + 1
    );
    this.northeast = new Quadtree(
      { x: x + hw, y: y, width: hw, height: hh },
      this.capacity,
      this.maxDepth,
      this.depth + 1
    );
    this.southwest = new Quadtree(
      { x: x, y: y + hh, width: hw, height: hh },
      this.capacity,
      this.maxDepth,
      this.depth + 1
    );
    this.southeast = new Quadtree(
      { x: x + hw, y: y + hh, width: hw, height: hh },
      this.capacity,
      this.maxDepth,
      this.depth + 1
    );

    this.divided = true;

    // Redistribute existing points to children
    for (const point of this.points) {
      this.insertIntoChildren(point);
    }
    this.points = [];
  }

  /**
   * Insert a point into appropriate child
   */
  insertIntoChildren(point) {
    if (this.northwest.contains(point)) {
      this.northwest.insert(point);
    } else if (this.northeast.contains(point)) {
      this.northeast.insert(point);
    } else if (this.southwest.contains(point)) {
      this.southwest.insert(point);
    } else if (this.southeast.contains(point)) {
      this.southeast.insert(point);
    }
  }

  /**
   * Insert a point into the quadtree
   * Point should have { x, y, id, ... } properties
   */
  insert(point) {
    if (!this.contains(point)) {
      return false;
    }

    if (!this.divided) {
      if (this.points.length < this.capacity || this.depth >= this.maxDepth) {
        this.points.push(point);
        return true;
      }
      this.subdivide();
    }

    this.insertIntoChildren(point);
    return true;
  }

  /**
   * Query all points within a rectangular range
   * Range: { x, y, width, height }
   */
  query(range, found = []) {
    if (!this.intersects(range)) {
      return found;
    }

    for (const point of this.points) {
      if (
        point.x >= range.x &&
        point.x < range.x + range.width &&
        point.y >= range.y &&
        point.y < range.y + range.height
      ) {
        found.push(point);
      }
    }

    if (this.divided) {
      this.northwest.query(range, found);
      this.northeast.query(range, found);
      this.southwest.query(range, found);
      this.southeast.query(range, found);
    }

    return found;
  }

  /**
   * Query all points within a circular range
   * More accurate for collision detection
   */
  queryCircle(cx, cy, radius, found = []) {
    // First check bounding box
    const range = {
      x: cx - radius,
      y: cy - radius,
      width: radius * 2,
      height: radius * 2,
    };

    if (!this.intersects(range)) {
      return found;
    }

    const radiusSq = radius * radius;

    for (const point of this.points) {
      const dx = point.x - cx;
      const dy = point.y - cy;
      if (dx * dx + dy * dy <= radiusSq) {
        found.push(point);
      }
    }

    if (this.divided) {
      this.northwest.queryCircle(cx, cy, radius, found);
      this.northeast.queryCircle(cx, cy, radius, found);
      this.southwest.queryCircle(cx, cy, radius, found);
      this.southeast.queryCircle(cx, cy, radius, found);
    }

    return found;
  }

  /**
   * Find the nearest point to a given position (excluding a specific id)
   * Uses expanding radius search for efficiency
   */
  findNearest(x, y, excludeId = null, maxRadius = Infinity) {
    let nearest = null;
    let nearestDistSq = maxRadius * maxRadius;

    // Start with a small search radius and expand
    let searchRadius = 10;
    const maxSearchRadius = Math.max(this.bounds.width, this.bounds.height);

    while (searchRadius <= maxSearchRadius && searchRadius * searchRadius <= nearestDistSq) {
      const candidates = this.queryCircle(x, y, searchRadius);

      for (const point of candidates) {
        if (excludeId !== null && point.id === excludeId) continue;

        const dx = point.x - x;
        const dy = point.y - y;
        const distSq = dx * dx + dy * dy;

        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearest = point;
        }
      }

      // If we found something within this radius, we're done
      if (nearest && nearestDistSq <= searchRadius * searchRadius) {
        break;
      }

      searchRadius *= 2;
    }

    // If nothing found yet, do a full search
    if (!nearest && maxRadius === Infinity) {
      const allPoints = this.query(this.bounds);
      for (const point of allPoints) {
        if (excludeId !== null && point.id === excludeId) continue;

        const dx = point.x - x;
        const dy = point.y - y;
        const distSq = dx * dx + dy * dy;

        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearest = point;
        }
      }
    }

    return nearest ? { point: nearest, distSq: nearestDistSq } : null;
  }

  /**
   * Clear all points from the quadtree (reuse structure)
   */
  clear() {
    this.points = [];
    if (this.divided) {
      this.northwest.clear();
      this.northeast.clear();
      this.southwest.clear();
      this.southeast.clear();
      // Reset subdivision to allow fresh rebuild
      this.divided = false;
      this.northwest = null;
      this.northeast = null;
      this.southwest = null;
      this.southeast = null;
    }
  }
}

module.exports = { Quadtree };
