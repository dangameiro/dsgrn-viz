// dsgrn_viz.js
// Daniel Gameiro
// 2021-07-10
// MIT LICENSE

var general_settings = {
  transitionDuration: 300,
  firstRun: true,
  selected_ms_2d: [],
  selected_ms_3d: [],
  current_dim: -1,
  current_file_data: {},
  user_file_data: [],
  current_param: -1,
  has_eq_cells: false
};
var cell_complex_settings = {
  div_name: "myDiv",
  opacity: 0.5,
  vertSize: 2.2,
  lineWidth: 2.2,
  self_arrow_size: 8,
  eq_cell_color: "crimson",
  width: 700,
  height: 700,
  no_ms_color: "#FFFFFF",
  showArrows: 5, // 0 = all, 5 = none
  wireframe: 0, // 0 = all, 2 = none
  x_min: -1,
  x_max: -1,
  y_min: -1,
  y_max: -1
};
var morse_graph_settings = {
  width: 550,
  height: 450,
  moveDown: -50,
  node_rx: 50,
  node_ry: 16,
  label_font_size: 13,
  opacity: 0.8,
  position_scale: 0.05,
  arrow_curvature: 0.3,
  selectMethod: 0 // 0 = single, 1 = multiple, 2 = interval
};
var arrow_settings = {
  tip_dims: 5,
  line_width: 2.2,
  single_color: "#000000",
  double_color: "#C70039",
  size: 0.3,
  factor: 0.75,
  self_arrow_size: 9,
  maxarrowsize: -1,
  cone_num_base_points: 10,
  cone_radius: 0.04
};
var param_graph_settings = {
  width: 900,
  height: 650,
  r: 11,
  nodeColor: "#5e96eb"
};
var colorMaps = {
  colorblind1: ["#a50026", "#d73027", "#f46d43", "#fdae61", "#fee090", "#ffffbf", "#e0f3f8", "#abd9e9", "#74add1", "#4575b4", "#313695"]
};

var initial_file_name = d3.select("#fileSelect option")._groups[0][0].value;

d3.select("#messages").style("display", "none");

document.getElementById("arr_size").value = arrow_settings.factor;

//const cellComplexScale = (pt) => 50 + pt * 200;

const cellComplexXScale = (x) => 50 + ((x - cell_complex_settings.x_min) / (cell_complex_settings.x_max - cell_complex_settings.x_min)) * 600;
const cellComplexYScale = (y) => 50 + ((cell_complex_settings.y_max - y) / (cell_complex_settings.y_max - cell_complex_settings.y_min)) * 600;

const fillRange = (start, end) => Array(end - start + 1).fill().map((item, index) => start + index);
var colorMap = d3.scaleOrdinal(d3.schemeCategory10);

function invalid_interval_message() {
  d3.select("#messages").style("display", "none");
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////  Network  ////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function plot_network(data) {
  document.getElementById("network").innerHTML = "";

  var network_container = d3.select("#network").graphviz();
  var graphviz_data = `digraph { bgcolor="transparent"`;

  data.nodes.forEach(n => {
    graphviz_data += `${n.id} [id="${n.id}" label="${n.id}"]`;
  });

  data.links.forEach(l => {
    if (l.type == 1) {
      graphviz_data += `${l.source} -> ${l.target} [id="${l.source}->${l.target}" label=""]`;
    }
    else {
      graphviz_data += `${l.source} -> ${l.target} [id="${l.source}->${l.target}" label="" arrowhead="tee"]`;
    }
  });

  graphviz_data += `}`;

  network_container.renderDot(graphviz_data);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////  Parameter graph  ///////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function plot_param_graph(data) {

  document.getElementById("param_node").innerHTML = "";
  document.getElementById("viz").innerHTML = "";

  var graph = data.parameter_graph;
  var complex = data.complex;
  var db = data.dynamics_database;
  var network = data.network;

  var param_dim = network.parameter_dim;
  document.getElementById("param_dim_selected").innerHTML = `Parameter dimension: ${param_dim}`;

  if (db[0].equilibrium_cells != undefined && db[0].equilibrium_cells.length > 0) general_settings.has_eq_cells = true;

  plot_network(network);

  // find range of coords for cell complex
  var x_min = complex.verts_coords[0][0], x_max = complex.verts_coords[0][0];
  var y_min = complex.verts_coords[0][1], y_max = complex.verts_coords[0][1];
  complex.verts_coords.forEach(vert => {
    if (vert[0] > x_max) {
      x_max = vert[0];
    }
    if (vert[0] < x_min) {
      x_min = vert[0];
    }
    if (vert[1] > y_max) {
      y_max = vert[1];
    }
    if (vert[1] < y_min) {
      y_min = vert[1];
    }
  });
  cell_complex_settings.x_max = x_max;
  cell_complex_settings.x_min = x_min;
  cell_complex_settings.y_max = y_max;
  cell_complex_settings.y_min = y_min;

  arrow_settings.maxarrowsize = -1;
  general_settings.current_param = db[0].parameter;

  var curr_mg = db.find(dt => dt.parameter == general_settings.current_param).morse_graph;
  var curr_ms = db.find(dt => dt.parameter == general_settings.current_param).morse_sets;
  var curr_stg = db.find(dt => dt.parameter == general_settings.current_param).stg;
  var curr_eqCells;
  if (general_settings.has_eq_cells) curr_eqCells = db.find(dt => dt.parameter == general_settings.current_param).equilibrium_cells;

  var graphLayout = d3.forceSimulation(graph.nodes)
    .force("charge", d3.forceManyBody().strength(-500))
    .force("center", d3.forceCenter(param_graph_settings.width / 2, param_graph_settings.height / 2))
    .force("x", d3.forceX(param_graph_settings.width / 2).strength(1.2))
    .force("y", d3.forceY(param_graph_settings.height / 2).strength(1.2))
    .force("link", d3.forceLink(graph.links).id(function (d) { return d.id; }).distance(110).strength(1))
    .on("tick", ticked);

  var adjlist = [];

  graph.links.forEach(function (d) {
    adjlist[d.source.index + "-" + d.target.index] = true;
    adjlist[d.target.index + "-" + d.source.index] = true;
  });

  function neigh(a, b) {
    return a == b || adjlist[a + "-" + b];
  }

  var svg = d3.select("#viz").attr("width", param_graph_settings.width).attr("height", param_graph_settings.height);
  var container = svg.append("g");

  svg.call(
    d3.zoom()
      .scaleExtent([.1, 4])
      .on("zoom", function () { container.attr("transform", d3.event.transform); })
  );

  var link = container.append("g").attr("class", "links")
    .selectAll("line")
    .data(graph.links)
    .enter()
    .append("line")
    .attr("stroke", "#aaa")
    .attr("stroke-width", "1px");

  var node = container.append("g").attr("class", "nodes")
    .selectAll("g")
    .data(graph.nodes)
    .enter()
    .append("g");

  var circs = node.append("circle")
    .attr("r", param_graph_settings.r)
    .attr("fill", d => {
      if (d.color != "") { return d.color; }
      else { return param_graph_settings.nodeColor; }
    });

  var labels = node.append("text")
    .text(d => d.id)
    .attr("x", d => d.id.toString().length * (-2.8))
    .attr("y", 3)
    .style("fill", "black")
    .style("font-family", "Arial")
    .style("font-size", 10)
    .style("pointer-events", "none");

  node.on("click", click_param_graph);

  node.call(
    d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended)
  );

  function ticked() {
    node.call(updateNode);
    link.call(updateLink);
  }

  graph.nodes.forEach(n => {
    d3.select("#param_node").append("option")
      .attr("value", n.id)
      .attr("selected", () => {
        if (n.id == general_settings.current_param) { return "selected" } else { return null }
      })
      .html(n.id);
  });

  document.getElementById("param_node_selected").innerHTML = "Parameter node: " + document.getElementById("param_node").value;

  sortSelect(document.getElementById("param_node"));

  document.getElementById("param_node").addEventListener("change", e => {
    graph.nodes.forEach(n => {
      if (n.id == e.target.value) {
        simulateClick(circs._groups[0][graph.nodes.indexOf(n)]);
      }
    });
  });

  function sortSelect(selElem) {
    var tmpAry = new Array();
    for (var i = 0; i < selElem.options.length; i++) {
      tmpAry[i] = parseInt(selElem.options[i].value);
    }
    tmpAry.sort((a, b) => a - b);
    while (selElem.options.length > 0) {
      selElem.options[0] = null;
    }
    for (var i = 0; i < tmpAry.length; i++) {
      var op = new Option(tmpAry[i], tmpAry[i]);
      selElem.options[i] = op;
    }
    return;
  }

  function click_param_graph(e, n, list) {

    var list2 = list.map(g => d3.select(g).select("circle")._groups[0][0]);

    var neighbors = [];

    for (i = 0; i < graph.links.length; i++) {
      if (graph.links[i].source.id == e.id) {
        d3.select(link._groups[0][i]).attr("stroke", "black")
          .attr("stroke-width", 2);
        neighbors.push(graph.links[i].target.id);
      }
      else if (graph.links[i].target.id == e.id) {
        d3.select(link._groups[0][i]).attr("stroke", "black")
          .attr("stroke-width", 2);
        neighbors.push(graph.links[i].source.id);
      }
      else {
        d3.select(link._groups[0][i]).attr("stroke", "#aaa")
          .attr("stroke-width", 1);
      }
    }

    graph.nodes.forEach(n => {
      if (neighbors.includes(n.id)) {
        neighbors[neighbors.indexOf(n.id)] = circs._groups[0][graph.nodes.indexOf(n)];
      }
    });

    list2.forEach(circ => {
      if (circ == list2[n]) {
        d3.select(circ).attr("fill", "red")
          .attr("r", param_graph_settings.r + 4);
      }
      else if (neighbors.includes(circ)) {
        d3.select(circ).attr("fill", "red")
          .attr("r", param_graph_settings.r);
      }
      else {
        d3.select(circ).attr("fill", d => {
          if (d.color != "") { return d.color; }
          else { return param_graph_settings.nodeColor; }
        })
          .attr("r", param_graph_settings.r);
      }
    });

    document.getElementById("param_node").value = e.id;
    general_settings.current_param = e.id;
    document.getElementById("param_node_selected").innerHTML = "Parameter node: " + e.id;

    curr_mg = db.find(dt => dt.parameter == general_settings.current_param).morse_graph;
    curr_ms = db.find(dt => dt.parameter == general_settings.current_param).morse_sets;
    curr_stg = db.find(dt => dt.parameter == general_settings.current_param).stg;
    if (general_settings.has_eq_cells) curr_eqCells = db.find(dt => dt.parameter == general_settings.current_param).equilibrium_cells;

    var attractor_counter = 0;

    curr_mg.forEach(mg => {
      if (mg.rank == 0) {
        attractor_counter++;
      }
    });

    var ineq = "";

    e.inequalities.forEach(i => {
      ineq += "<div class=\"ineq\">" + i + "</div>";
    });

    document.getElementById("num_ms").innerHTML = `Morse sets: ${curr_mg.length}`;
    document.getElementById("num_attractors").innerHTML = `Attractors: ${attractor_counter}`;
    document.getElementById("inequalities").innerHTML = `Inequalities: ${ineq}`;

    if (complex.dimension == 2) {
      loadJSON_2D(complex, curr_mg, curr_ms, curr_stg, curr_eqCells);
    }
    else {
      loadJSON_3D(complex, curr_mg, curr_ms, curr_stg, curr_eqCells);
    }
  }

  var simulateClick = function (elem) {
    var evt = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    var canceled = !elem.dispatchEvent(evt);
  };

  graph.nodes.forEach(n => {
    if (n.id == general_settings.current_param) {
      simulateClick(circs._groups[0][graph.nodes.indexOf(n)]);
    }
  });

  function fixna(x) {
    if (isFinite(x)) return x;
    return 0;
  }

  function updateLink(link) {
    link.attr("x1", function (d) { return fixna(d.source.x); })
      .attr("y1", function (d) { return fixna(d.source.y); })
      .attr("x2", function (d) { return fixna(d.target.x); })
      .attr("y2", function (d) { return fixna(d.target.y); });
  }

  function updateNode(node) {
    node.attr("transform", function (d) {
      return "translate(" + fixna(d.x) + "," + fixna(d.y) + ")";
    });
  }

  function dragstarted(d) {
    d3.event.sourceEvent.stopPropagation();
    if (!d3.event.active) graphLayout.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
  }

  function dragended(d) {
    if (!d3.event.active) graphLayout.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////  2D  ///////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function loadJSON_2D(d_complex, d_mg, d_ms, d_stg, d_eqCells) {

  general_settings.current_dim = 2;
  document.getElementById("space_dim_selected").innerHTML = `Phase dimension: 2`;

  document.getElementById("morse_graph").innerHTML = "";
  document.getElementById("myDiv").innerHTML = "";

  document.getElementById("arrows").innerHTML = `<option value="0" id="a0" selected="selected">All</option>
    <option value="1" id="a1">Single arrows only</option>
    <option value="2" id="a2">Double arrows only</option>
    <option value="3" id="a3">Self arrows only</option>
    <option value="4" id="a4">Single and double arrows</option>
    <option value="5" id="a5">None</option>`;

  cell_complex_settings.showArrows = 0;

  document.getElementById("wireframe").innerHTML = `<option value="0" id="w0" selected="selected">All</option>
    <option value="1" id="w1">Only selected morse sets</option>
    <option value="2" id="w2">None</option>`;

  document.getElementById("w1").setAttribute("style", "display: none");

  cell_complex_settings.wireframe = 0;

  const svg = d3.select("#myDiv").append("svg")
    .attr("height", cell_complex_settings.height)
    .attr("width", cell_complex_settings.width);

  svg.append("defs").append("marker")
    .attr("id", "triangle")
    .attr("refX", 5)
    .attr("refY", 5)
    .attr("markerWidth", 5)
    .attr("markerHeight", 5)
    .attr("viewBox", "0 0 10 10")
    .attr("orient", "auto-start-reverse")
    .append("polyline")
    .attr("points", "0 0, 10 5, 0 10, 0 0")
    .attr("fill", arrow_settings.single_color)
    .attr("stroke", arrow_settings.single_color);

  svg.append("defs").append("marker")
    .attr("id", "redTriangle")
    .attr("refX", 5)
    .attr("refY", 5)
    .attr("markerWidth", 5)
    .attr("markerHeight", 5)
    .attr("viewBox", "0 0 10 10")
    .attr("orient", "auto-start-reverse")
    .append("polyline")
    .attr("points", "0 0, 10 5, 0 10, 0 0")
    .attr("fill", arrow_settings.double_color)
    .attr("stroke", arrow_settings.double_color);

  function drawArrow(x1, y1, x2, y2, cellFromInd, cellToInd) {

    var triSize = arrow_settings.tip_dims / 2 * arrow_settings.line_width;
    var arrowLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    var t0 = 1 - triSize / arrowLength;
    var xFinal = (1 - t0) * x1 + t0 * x2;
    var yFinal = (1 - t0) * y1 + t0 * y2;

    svg.append("line")
      .attr("x1", x1)
      .attr("y1", y1)
      .attr("x2", xFinal)
      .attr("y2", yFinal)
      .attr("id", `${cellFromInd}arrow${cellToInd}`)
      .attr("stroke-width", arrow_settings.line_width)
      .attr("stroke", arrow_settings.single_color)
      .attr("marker-end", "url(#triangle)")
      .attr("class", "singleArrow");
  }

  const graphSVG = d3.select("#morse_graph")
    .append("svg")
    .attr("width", morse_graph_settings.width)
    .attr("height", morse_graph_settings.height)
    .attr("transform", `translate(0, ${morse_graph_settings.moveDown})`);

  const complex = d_complex;
  const dim = complex.dimension;
  const verts_coords = complex.verts_coords;
  const cells = complex.cells;
  const cell_inds = cells.map(c => c.cell_index);
  const stg = d_stg;

  var nodeLabels = d_mg.map(d => d.label);
  var nodeRanks = d_mg.map(d => parseInt(d.rank));
  var morseGraph = d_mg;
  var morseSets = d_ms;

  stg.forEach(a => {
    for (i = 0; i < a.adjacencies.length; i++) {
      if (a.node != a.adjacencies[i]) {

        var cellFromInd = a.node;
        var cellToInd = a.adjacencies[i];

        var x1 = cellCenter(cellFromInd)[0];
        var x2 = cellCenter(cellToInd)[0];
        var y1 = cellCenter(cellFromInd)[1];
        var y2 = cellCenter(cellToInd)[1];

        var cellFromArrInd = cell_inds.indexOf(cellFromInd);
        var cellToArrInd = cell_inds.indexOf(cellToInd);

        var cellFromVerts = cells[cellFromArrInd].cell_verts;
        var cellToVerts = cells[cellToArrInd].cell_verts;

        var commonVerts = cellFromVerts.filter(value => cellToVerts.includes(value));

        var xm, ym;

        if (commonVerts.length == 2) {
          var commonVert1 = verts_coords[commonVerts[0]];
          var commonVert2 = verts_coords[commonVerts[1]];

          xm = (cellComplexXScale(commonVert1[0]) + cellComplexXScale(commonVert2[0])) / 2;
          ym = (cellComplexYScale(commonVert1[1]) + cellComplexYScale(commonVert2[1])) / 2;
        }
        else if (commonVerts.length == 1) {
          var commonVert1 = verts_coords[commonVerts[0]];

          xm = cellComplexXScale(commonVert1[0]);
          ym = cellComplexYScale(commonVert1[1]);
        }
        else if (commonVerts.length == 0) {
          console.log("Error: edge between non adjacent cells in STG");
        }
        else {
          commonVerts.forEach(v => {
            xm += cellComplexXScale(verts_coords[v][0]);
            ym += cellComplexXScale(verts_coords[v][1]);
          });
          xm /= commonVerts.length;
          ym /= commonVerts.length;
        }

        var d1 = Math.sqrt((xm - x1) ** 2 + (ym - y1) ** 2);
        var d2 = Math.sqrt((xm - x2) ** 2 + (ym - y2) ** 2);

        var minD = Math.min(d1, d2);

        if (arrow_settings.maxarrowsize < 0) {
          arrow_settings.maxarrowsize = minD;
        }
        else if (arrow_settings.maxarrowsize > minD) {
          arrow_settings.maxarrowsize = minD;
        }

      }
    }
  });

  const graph = cells.forEach(dCell => {

    if (dCell.cell_dim == 0) {
      svg.append("circle")
        .attr("r", cell_complex_settings.vertSize + 1.0)
        .attr("cx", cellComplexXScale(verts_coords[dCell.cell_verts[0]][0]))
        .attr("cy", cellComplexYScale(verts_coords[dCell.cell_verts[0]][1]))
        .attr("fill", "black")
        .attr("class", "cell_dim0")
        .attr("id", `cell${dCell.cell_index}`);
    }
    else if (dCell.cell_dim == 1) {
      svg.append("line")
        .attr("x1", cellComplexXScale(verts_coords[dCell.cell_verts[0]][0]))
        .attr("x2", cellComplexXScale(verts_coords[dCell.cell_verts[1]][0]))
        .attr("y1", cellComplexYScale(verts_coords[dCell.cell_verts[0]][1]))
        .attr("y2", cellComplexYScale(verts_coords[dCell.cell_verts[1]][1]))
        .attr("stroke", "black")
        .attr("stroke-width", cell_complex_settings.lineWidth)
        .attr("class", "cell_dim1")
        .attr("id", `cell${dCell.cell_index}`);
    }
    else {
      var points = "";

      dCell.cell_verts.forEach(dVert => {
        points += (cellComplexXScale(verts_coords[dVert][0])) + " " + (cellComplexYScale(verts_coords[dVert][1])) + ", ";
      });

      points = points.substring(0, points.length - 2);

      svg.append("polyline")
        .attr("points", points)
        .attr("fill", "white")
        .attr("style", "opacity: " + cell_complex_settings.opacity)
        .attr("class", "cell_dim2")
        .attr("id", `cell${dCell.cell_index}`);
    }

  });

  const circles = d3.selectAll("circle");
  const lines = d3.selectAll("line");

  circles._groups[0].forEach(circ => {
    svg.append("use")
      .attr("xlink:href", `#${circ.id}`);
  });

  lines._groups[0].forEach(ln => {
    svg.append("use")
      .attr("xlink:href", `#${ln.id}`);
  });

  function cellCenter(cellInd) {
    var cell;

    cells.forEach(c => {
      if (c.cell_index == cellInd) {
        cell = c;
        return;
      }
    });

    var xCenter = 0;
    cell.cell_verts.forEach(vert => {
      xCenter += cellComplexXScale(verts_coords[vert][0]);
    });
    xCenter = xCenter / cell.cell_verts.length;

    var yCenter = 0;
    cell.cell_verts.forEach(vert => {
      yCenter += cellComplexYScale(verts_coords[vert][1]);
    });
    yCenter = yCenter / cell.cell_verts.length;

    return [xCenter, yCenter];
  }

  function createArrow_old(cellFromInd, cellToInd) {

    var x1 = cellCenter(cellFromInd)[0];
    var x2 = cellCenter(cellToInd)[0];
    var y1 = cellCenter(cellFromInd)[1];
    var y2 = cellCenter(cellToInd)[1];

    var cellFromArrInd = cell_inds.indexOf(cellFromInd);
    var cellToArrInd = cell_inds.indexOf(cellToInd);

    var cellFromVerts = cells[cellFromArrInd].cell_verts;
    var cellToVerts = cells[cellToArrInd].cell_verts;

    var commonVerts = cellFromVerts.filter(value => cellToVerts.includes(value));

    var xm, ym;

    if (commonVerts.length == 2) {
      var commonVert1 = verts_coords[commonVerts[0]];
      var commonVert2 = verts_coords[commonVerts[1]];

      xm = (cellComplexXScale(commonVert1[0]) + cellComplexXScale(commonVert2[0])) / 2;
      ym = (cellComplexYScale(commonVert1[1]) + cellComplexYScale(commonVert2[1])) / 2;
    }
    else if (commonVerts.length == 1) {
      var commonVert1 = verts_coords[commonVerts[0]];

      xm = cellComplexXScale(commonVert1[0]);
      ym = cellComplexYScale(commonVert1[1]);
    }
    else if (commonVerts.length == 0) {
      console.log("Error: edge between non adjacent cells in STG");
    }
    else {
      commonVerts.forEach(v => {
        xm += cellComplexXScale(verts_coords[v][0]);
        ym += cellComplexXScale(verts_coords[v][1]);
      });
      xm /= commonVerts.length;
      ym /= commonVerts.length;
    }

    var tm = 0;

    if (x1 == x2) {
      tm = (ym - y1) / (y2 - y1);
    }
    else {
      tm = (xm - x1) / (x2 - x1);
    }

    var t1 = tm - arrow_settings.factor * tm;
    var t2 = tm + arrow_settings.factor * (1 - tm);

    var x1new = (1 - t1) * x1 + t1 * x2;
    var x2new = (1 - t2) * x1 + t2 * x2;
    var y1new = (1 - t1) * y1 + t1 * y2;
    var y2new = (1 - t2) * y1 + t2 * y2;

    drawArrow(x1new, y1new, x2new, y2new, cellFromInd, cellToInd);
  }

  function createArrow(cellFromInd, cellToInd) {

    var x1 = cellCenter(cellFromInd)[0];
    var x2 = cellCenter(cellToInd)[0];
    var y1 = cellCenter(cellFromInd)[1];
    var y2 = cellCenter(cellToInd)[1];

    var cellFromArrInd = cell_inds.indexOf(cellFromInd);
    var cellToArrInd = cell_inds.indexOf(cellToInd);

    var cellFromVerts = cells[cellFromArrInd].cell_verts;
    var cellToVerts = cells[cellToArrInd].cell_verts;

    var commonVerts = cellFromVerts.filter(value => cellToVerts.includes(value));

    var xm, ym;

    if (commonVerts.length == 2) {
      var commonVert1 = verts_coords[commonVerts[0]];
      var commonVert2 = verts_coords[commonVerts[1]];

      xm = (cellComplexXScale(commonVert1[0]) + cellComplexXScale(commonVert2[0])) / 2;
      ym = (cellComplexYScale(commonVert1[1]) + cellComplexYScale(commonVert2[1])) / 2;
    }
    else if (commonVerts.length == 1) {
      var commonVert1 = verts_coords[commonVerts[0]];

      xm = cellComplexXScale(commonVert1[0]);
      ym = cellComplexYScale(commonVert1[1]);
    }
    else if (commonVerts.length == 0) {
      console.log("Error: edge between non adjacent cells in STG");
    }
    else {
      commonVerts.forEach(v => {
        xm += cellComplexXScale(verts_coords[v][0]);
        ym += cellComplexXScale(verts_coords[v][1]);
      });
      xm /= commonVerts.length;
      ym /= commonVerts.length;
    }

    var d1 = Math.sqrt((xm - x1) ** 2 + (ym - y1) ** 2);
    var d2 = Math.sqrt((xm - x2) ** 2 + (ym - y2) ** 2);

    var v1, v2;
    var x1new, y1new;
    var x2new, y2new;

    if (d1 <= d2) {
      v1 = x1 - xm;
      v2 = y1 - ym;
    }
    else {
      v1 = x2 - xm;
      v2 = y2 - ym;
    }

    var norm_v = Math.sqrt(v1 ** 2 + v2 ** 2);
    v1 = v1 / norm_v;
    v2 = v2 / norm_v;

    if (d1 <= d2) {
      x1new = xm + arrow_settings.factor * arrow_settings.maxarrowsize * v1;
      y1new = ym + arrow_settings.factor * arrow_settings.maxarrowsize * v2;
      x2new = xm - arrow_settings.factor * arrow_settings.maxarrowsize * v1;
      y2new = ym - arrow_settings.factor * arrow_settings.maxarrowsize * v2;
    }
    else {
      x1new = xm - arrow_settings.factor * arrow_settings.maxarrowsize * v1;
      y1new = ym - arrow_settings.factor * arrow_settings.maxarrowsize * v2;
      x2new = xm + arrow_settings.factor * arrow_settings.maxarrowsize * v1;
      y2new = ym + arrow_settings.factor * arrow_settings.maxarrowsize * v2;
    }

    drawArrow(x1new, y1new, x2new, y2new, cellFromInd, cellToInd);
  }

  function drawSelfArrow_old(targetInd) {
    var targetCenter = cellCenter(targetInd);
    var xCenter = targetCenter[0];
    var yCenter = targetCenter[1];

    var xTransform = 970 + 1250 * (xCenter - 50) / 50;
    var yTransform = 970 + 1250 * (yCenter - 50) / 50;

    svg.append("path")
      .attr("d", "M70.846,324.059c3.21,3.926,8.409,3.926,11.619,0l69.162-84.621c3.21-3.926,1.698-7.108-3.372-7.108h-36.723 " +
        "c-5.07,0-8.516-4.061-7.427-9.012c18.883-85.995,95.625-150.564,187.207-150.564c105.708,0,191.706,85.999,191.706,191.706 " +
        "c0,105.709-85.998,191.707-191.706,191.707c-12.674,0-22.95,10.275-22.95,22.949s10.276,22.949,22.95,22.949 " +
        "c131.018,0,237.606-106.588,237.606-237.605c0-131.017-106.589-237.605-237.606-237.605 " +
        "c-116.961,0-214.395,84.967-233.961,196.409c-0.878,4.994-5.52,9.067-10.59,9.067H5.057c-5.071,0-6.579,3.182-3.373,7.108 " +
        "L70.846,324.059z")
      .attr("fill", "black")
      .attr("transform", `scale(0.04, 0.04) translate(${xTransform}, ${yTransform})`)
      .attr("class", "selfArrow");
  }

  function drawSelfArrow(targetInd) {
    var targetCenter = cellCenter(targetInd);
    var xCenter = targetCenter[0];
    var yCenter = targetCenter[1];

    svg.append("circle")
      .attr("cx", xCenter)
      .attr("cy", yCenter)
      .attr("class", "selfArrow")
      .attr("r", cell_complex_settings.self_arrow_size);
  }

  function plotArrows() {
    stg.forEach(a => {
      for (i = 0; i < a.adjacencies.length; i++) {
        if (a.node != a.adjacencies[i]) {
          var doubleArrowCheck = document.getElementById(`${a.adjacencies[i]}arrow${a.node}`);

          if (doubleArrowCheck === null) {
            createArrow(a.node, a.adjacencies[i]);
          }
          else {
            d3.select(doubleArrowCheck)
              .attr("marker-end", "url(#redTriangle)")
              .attr("marker-start", "url(#redTriangle)")
              .attr("stroke", arrow_settings.double_color)
              .attr("class", "doubleArrow");
          }
        }
        else {
          drawSelfArrow(a.node);
        }
      }
    });
  }

  plotArrows();

  function drawNode(nodeInd, xPos, yPos) {

    var label = nodeLabels[nodeInd];

    graphSVG.append("ellipse")
      .attr("rx", morse_graph_settings.node_rx)
      .attr("ry", morse_graph_settings.node_ry)
      .attr("cx", xPos)
      .attr("cy", yPos)
      .attr("stroke", "black")
      .attr("stroke-width", 1.5)
      .attr("id", `whitenode${nodeInd}`)
      .attr("class", "nodes ellipse")
      .attr("fill", "white");

    graphSVG.append("ellipse")
      .attr("rx", morse_graph_settings.node_rx)
      .attr("ry", morse_graph_settings.node_ry)
      .attr("cx", xPos)
      .attr("cy", yPos)
      .attr("stroke", "black")
      .attr("stroke-width", 1.5)
      .attr("id", `node${nodeInd}`)
      .attr("class", "nodes ellipse")
      .attr("fill", colorMap(nodeInd))
      .attr("style", `fill-opacity: ${cell_complex_settings.opacity}`);

    graphSVG.append("text")
      .attr("text-anchor", "middle")
      .attr("x", xPos)
      .attr("y", yPos + 4)
      .attr("font-size", morse_graph_settings.label_font_size)
      .attr("class", "nodes text")
      .attr("id", `text${nodeInd}`)
      .html(label);

  }

  function cellColors() {
    morseSets.forEach(set => {

      var setColor = colorMap(set.index);

      set.cells.forEach(setCell => {

        d3.select(`#cell${setCell}`)
          .transition().duration(general_settings.transitionDuration)
          .attr("fill", setColor);

      });
    });
  }

  ////////////////
  // DRAW NODES //
  ////////////////
  var maxDepth = Math.max.apply(Math, nodeRanks);
  var ySize = morse_graph_settings.height / (maxDepth + 1);

  if (maxDepth == 1) {
    var thisRank = [];

    for (var j = 0; j < nodeRanks.length; j++) {
      if (nodeRanks[j] == 1) {
        thisRank.push(j);
      }
    }

    var xSize = morse_graph_settings.width / thisRank.length;

    if (thisRank.length == 2) {
      drawNode(thisRank[0], morse_graph_settings.width / 2 - 100, morse_graph_settings.height / 2 - 50);
      drawNode(thisRank[1], morse_graph_settings.width / 2 + 100, morse_graph_settings.height / 2 - 50);
    }
    else {
      thisRank.forEach(nodeIndex => {
        var x = thisRank.indexOf(nodeIndex) * xSize + xSize / 2;
        var y = morse_graph_settings.height / 2 - 50;

        drawNode(nodeIndex, x, y);
      });
    }

    var thisRank = [];

    for (var j = 0; j < nodeRanks.length; j++) {
      if (nodeRanks[j] == 0) {
        thisRank.push(j);
      }
    }

    var xSize = morse_graph_settings.width / thisRank.length;

    if (thisRank.length == 2) {
      drawNode(thisRank[0], morse_graph_settings.width / 2 - 100, morse_graph_settings.height / 2 + 50);
      drawNode(thisRank[1], morse_graph_settings.width / 2 + 100, morse_graph_settings.height / 2 + 50);
    }
    else {
      thisRank.forEach(nodeIndex => {
        var x = thisRank.indexOf(nodeIndex) * xSize + xSize / 2;
        var y = morse_graph_settings.height / 2 + 50;

        drawNode(nodeIndex, x, y);
      });
    }
  }
  else {
    for (var i = 0; i <= maxDepth; i++) {
      var thisRank = [];

      for (var j = 0; j < nodeRanks.length; j++) {
        if (nodeRanks[j] == i) {
          thisRank.push(j);
        }
      }

      var xSize = morse_graph_settings.width / thisRank.length;

      if (thisRank.length == 2) {
        drawNode(thisRank[0], morse_graph_settings.width / 2 - 100, (maxDepth - i) * ySize + ySize / 2);
        drawNode(thisRank[1], morse_graph_settings.width / 2 + 100, (maxDepth - i) * ySize + ySize / 2);
      }
      else {
        thisRank.forEach(nodeIndex => {
          var x = thisRank.indexOf(nodeIndex) * xSize + xSize / 2;
          var y = (maxDepth - i) * ySize + ySize / 2;

          drawNode(nodeIndex, x, y);
        });
      }
    }
  }

  cellColors();

  /////////////////
  // DRAW ARROWS //
  /////////////////
  function drawArrowMorse(x1, y1, xMid, yMid, x2, y2, cellFromInd, cellToInd) {

    var triSize = arrow_settings.tip_dims / 2 * arrow_settings.line_width;
    var arrowLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    var t0 = 1 - triSize / arrowLength;
    var xFinal = (1 - t0) * x1 + t0 * x2;
    var yFinal = (1 - t0) * y1 + t0 * y2;

    graphSVG.append("path")
      .attr("d", `M ${x1} ${y1} Q ${xMid} ${yMid} ${xFinal} ${yFinal}`)
      .attr("id", `${cellFromInd}arrow${cellToInd}`)
      .attr("stroke-width", arrow_settings.line_width)
      .attr("stroke", arrow_settings.single_color)
      .attr("marker-end", "url(#triangle)");
  }

  morseGraph.forEach(graphNode => {
    graphNode.adjacencies.forEach(edgeTo => {

      var x1 = parseInt(document.getElementById(`node${graphNode.node}`).getAttribute("cx"));
      var y1 = parseInt(document.getElementById(`node${graphNode.node}`).getAttribute("cy"));
      var x2 = parseInt(document.getElementById(`node${edgeTo}`).getAttribute("cx"));
      var y2 = parseInt(document.getElementById(`node${edgeTo}`).getAttribute("cy"));

      var disloc = (x2 - x1) + (y2 - y1);

      var arrowPosChange;

      if (x1 < x2 && disloc >= 0) {
        arrowPosChange = -disloc * morse_graph_settings.position_scale;
      }
      else if (x1 < x2 && disloc < 0) {
        arrowPosChange = disloc * morse_graph_settings.position_scale;
      }
      else if (x1 == x2) {
        arrowPosChange = 0;
      }
      else if (x1 > x2 && disloc >= 0) {
        arrowPosChange = disloc * morse_graph_settings.position_scale * 3;
      }
      else {
        arrowPosChange = -disloc * morse_graph_settings.position_scale * 3;
      }

      var x1final = x1;
      var y1final = y1 + morse_graph_settings.node_ry;
      var x2final = x2 + arrowPosChange;
      var y2final = y2 - morse_graph_settings.node_ry;

      var edgeToObj;

      morseGraph.forEach(toNode => {
        if (toNode.node == edgeTo) {
          edgeToObj = toNode;
        }
      });

      var xMid;
      var yMid;

      if ((graphNode.rank - edgeToObj.rank) > 1) {
        var xMidTemp = (x1final + x2final) / 2;
        var targetRank = edgeToObj.rank + 1;
        var targetRankNodes = [];
        var xTargetNodes = [];

        morseGraph.forEach(node => {
          if (node.rank == targetRank) {
            targetRankNodes.push(d3.select(`#node${node.node}`));
          }
        });

        targetRankNodes.forEach(n => {
          xTargetNodes.push(n._groups[0][0].getAttribute("cx"));
          yMid = n._groups[0][0].getAttribute("cy");
        });

        var nearestNode1, nearestNode2;

        if (xTargetNodes.length == 1) {
          if (x2final > x1final) {
            xMid = (morse_graph_settings.width + parseInt(xTargetNodes[0])) / 2;
          }
          else {
            xMid = xTargetNodes[0] / 2;
          }
        }
        else if (xTargetNodes.length == 2) {
          nearestNode1 = xTargetNodes[0];
          nearestNode2 = xTargetNodes[1];
          xMid = (parseInt(nearestNode2) + parseInt(nearestNode1)) / 2;
        }
        else if (xTargetNodes.length > 2) {
          nearestNode1 = xTargetNodes[0];
          nearestNode2 = xTargetNodes[1];
          for (var i = 2; i < xTargetNodes.length; i++) {
            if (Math.abs(xTargetNodes[i] - xMidTemp) < Math.abs(nearestNode1 - xMidTemp) && Math.abs(xTargetNodes[i] - xMidTemp) < Math.abs(nearestNode2 - xMidTemp)) {
              if (Math.abs(nearestNode1 - xMidTemp) < Math.abs(nearestNode2 - xMidTemp)) {
                nearestNode2 = xTargetNodes[i];
              }
              else {
                nearestNode1 = xTargetNodes[i];
              }
            }
            else if (Math.abs(xTargetNodes[i] - xMidTemp) <= Math.abs(nearestNode1 - xMidTemp) && Math.abs(xTargetNodes[i] - xMidTemp) > Math.abs(nearestNode2 - xMidTemp)) {
              nearestNode1 = xTargetNodes[i];
            }
            else if (Math.abs(xTargetNodes[i] - xMidTemp) > Math.abs(nearestNode1 - xMidTemp) && Math.abs(xTargetNodes[i] - xMidTemp) <= Math.abs(nearestNode2 - xMidTemp)) {
              nearestNode2 = xTargetNodes[i];
            }
          }

          xMid = (parseInt(nearestNode2) + parseInt(nearestNode1)) / 2;
        }
        else {
          console.log("error: no nodes at target rank");
        }

        if (Math.abs(x1final - xMid) <= 1 && Math.abs(x2final - xMid) <= 1) {
          if (x2final > morse_graph_settings.width / 2) {
            xMid = (x1final + x2final) / 2 + Math.sqrt(Math.pow((y2final - y1final), 2) + Math.pow((x2final - x1final), 2)) * morse_graph_settings.arrow_curvature;
          }
          else {
            xMid = (x1final + x2final) / 2 - Math.sqrt(Math.pow((y2final - y1final), 2) + Math.pow((x2final - x1final), 2)) * morse_graph_settings.arrow_curvature;
          }
        }
      }
      else {
        yMid = (y1final + y2final) / 2;

        if (x1final > x2final) {
          xMid = (x1final + x2final) / 2 - Math.sqrt(Math.pow((y2final - y1final), 2) + Math.pow((x2final - x1final), 2)) * morse_graph_settings.arrow_curvature;
        }
        else if (x1final < x2final) {
          xMid = (x1final + x2final) / 2 + Math.sqrt(Math.pow((y2final - y1final), 2) + Math.pow((x2final - x1final), 2)) * morse_graph_settings.arrow_curvature;
        }
        else {
          if (x2final > morse_graph_settings.width / 2) {
            xMid = (x1final + x2final) / 2 + Math.sqrt(Math.pow((y2final - y1final), 2) + Math.pow((x2final - x1final), 2)) * morse_graph_settings.arrow_curvature / 5;
          }
          else {
            xMid = (x1final + x2final) / 2 - Math.sqrt(Math.pow((y2final - y1final), 2) + Math.pow((x2final - x1final), 2)) * morse_graph_settings.arrow_curvature / 5;
          }
        }
      }

      drawArrowMorse(x1final, y1final, xMid, yMid, x2final, y2final, `morsegraph${graphNode.node}`, edgeTo);
    });
  });

  ////////////////////////////
  // DRAW NODES OVER ARROWS //
  ////////////////////////////
  var ellipses = graphSVG.selectAll("ellipse");
  var labelTexts = graphSVG.selectAll("text");

  ellipses._groups[0].forEach(ellipse => {
    graphSVG.append("use")
      .attr("xlink:href", `#${ellipse.id}`);
  });

  labelTexts._groups[0].forEach(txt => {
    graphSVG.append("use")
      .attr("xlink:href", `#${txt.id}`);
  });

  //////////////////
  // INTERACTIONS //
  //////////////////

  // cell complex
  var graphCells = d3.selectAll(".cell_dim2");

  graphCells
    .on("mouseover", function () {
      handleMouseOver(d3.select(this));
    })
    .on("mouseout", function () {
      handleMouseOut(d3.select(this));
    });

  const handleMouseOver = c => {
    morseSets.forEach(msData => {
      if (msData.cells.includes(parseInt(c._groups[0][0].id.substring(4, c._groups[0][0].id.length)))) {

        var setNode = document.getElementById(`node${msData.index}`);

        d3.select(setNode).transition().duration(300)
          .attr("style", "opacity: 1.0");

        msData.cells.forEach(cell => {
          var setCell = document.getElementById(`cell${cell}`);

          d3.select(setCell).transition().duration(300)
            .attr("style", "opacity: 1.0");
        });
      }
    });
  };

  const handleMouseOut = c => {
    morseSets.forEach(msData => {
      if (msData.cells.includes(parseInt(c._groups[0][0].id.substring(4, c._groups[0][0].id.length)))) {

        var setNode = document.getElementById(`node${msData.index}`);

        d3.select(setNode).transition().duration(300)
          .attr("style", "opacity: " + cell_complex_settings.opacity);

        msData.cells.forEach(cell => {
          var setCell = document.getElementById(`cell${cell}`);

          d3.select(setCell).transition().duration(300)
            .attr("style", "opacity: " + cell_complex_settings.opacity);
        });
      }
    });
  };

  function findInterval(n1, n2) {
    var node1, node2;

    if (morseGraph[n1].rank >= morseGraph[n2].rank) {
      node1 = n1;
      node2 = n2;
    }
    else {
      node1 = n2;
      node2 = n1;
    }

    var result = [node1];

    if (node1 == node2) {
      return result;
    }

    if (morseGraph[node1].rank == morseGraph[node2].rank) {
      return [];
    }

    morseGraph[node1].adjacencies.forEach(adj => {
      if (morseGraph[adj].rank >= morseGraph[node2].rank) {
        var temp = findInterval(adj, node2);

        if (temp.length > 0) {
          temp.forEach(t => {
            if (!result.includes(t)) {
              result.push(t);
            }
          });
        }
      }
    });

    if (result.length > 1) {
      return result;
    }
    else {
      return [];
    }
  }

  // morse graph
  var graphNodes = d3.selectAll(".nodes");
  var graphCells = d3.selectAll(".cell_dim2");

  graphNodes
    .on("click", function () {
      handleNodeClick(d3.select(this));
    });

  function reset_selection() {
    cellColors();

    for (var i = 0; i < morseGraph.length; i++) {
      var nd = document.getElementById(`node${i}`);
      d3.select(nd).transition().duration(general_settings.transitionDuration)
        .attr("fill", colorMap(i));
    }
  }

  function set_selection() {
    graphCells._groups[0].forEach(n => {
      var sameColor = false;

      general_settings.selected_ms_2d.forEach(cn => {
        if (morseSets[cn].cells.includes(parseInt(n.id.substring(4, n.id.length)))) {
          sameColor = true;
        }
      });

      if (!sameColor) {
        d3.select(n)
          .transition().duration(general_settings.transitionDuration)
          .attr("fill", "white");
      }
    });

    for (var i = 0; i < morseGraph.length; i++) {
      if (!general_settings.selected_ms_2d.includes(i)) {
        var nd = document.getElementById(`node${i}`);

        d3.select(nd).transition().duration(general_settings.transitionDuration)
          .attr("fill", "white");
      }
    }
  }

  function select_single_ms(click_ind) {
    if (general_settings.selected_ms_2d.includes(click_ind) && general_settings.selected_ms_2d.length == 1) {
      general_settings.selected_ms_2d.pop();
      reset_selection();
    }
    else {
      general_settings.selected_ms_2d = [click_ind];
      reset_selection();
      set_selection();
    }
  }

  function select_multiple_ms(click_ind) {
    if (general_settings.selected_ms_2d.includes(click_ind)) {
      if (general_settings.selected_ms_2d.length == 1) {
        general_settings.selected_ms_2d.pop();
        reset_selection();
      }
      else {
        general_settings.selected_ms_2d[general_settings.selected_ms_2d.indexOf(click_ind)] = general_settings.selected_ms_2d[general_settings.selected_ms_2d.length - 1];
        general_settings.selected_ms_2d.pop();
        reset_selection();
        set_selection();
      }
    }
    else {
      general_settings.selected_ms_2d.push(click_ind);
      reset_selection();
      set_selection();
    }
  }

  function select_interval_ms(click_ind) {
    invalid_interval_message();
    if (interval_node1 == null || interval_node2 != null) {
      interval_node1 = click_ind;
      interval_node2 = null;
    }
    else {
      interval_node2 = click_ind;
    }

    general_settings.selected_ms_2d = [];
    reset_selection();

    if (interval_node2 != null) {
      var interval = findInterval(interval_node1, interval_node2);

      if (interval.length > 1) {
        interval.forEach(i => {
          general_settings.selected_ms_2d.push(i);
        });
        set_selection();
      }
      else {
        d3.select("#messages")
          .style("display", "");

        setTimeout(invalid_interval_message, 5000);
      }
    }
    else {
      general_settings.selected_ms_2d = [interval_node1];
      set_selection();
    }
  }

  var interval_node1 = null;
  var interval_node2 = null;

  const handleNodeClick = c => {

    var click_id = c._groups[0][0].id;
    var click_ind;

    if (click_id.length == 0) {
      click_id = c._groups[0][0].getAttribute("href");
      click_ind = parseInt(click_id.substring(5, click_id.length));
    }
    else {
      click_ind = parseInt(click_id.substring(4, click_id.length));
    }

    if (morse_graph_settings.selectMethod == 0) {
      interval_node1 = null;
      interval_node2 = null;
      select_single_ms(click_ind);
    }
    else if (morse_graph_settings.selectMethod == 1) {
      interval_node1 = null;
      interval_node2 = null;
      select_multiple_ms(click_ind);
    }
    else { // INTERVAL_MS selected
      select_interval_ms(click_ind);
    }
  };

  //d3.select("#myDiv").style("transform", "scale(1,-1)");

  var face_alpha = document.getElementById("face_alpha");

  face_alpha.addEventListener("change", e => {
    if (general_settings.current_dim == 2) {
      cell_complex_settings.opacity = e.target.value;
      cells.forEach(c => {
        if (c.cell_dim == 2) {
          d3.select("#cell" + c.cell_index)
            .transition().duration(general_settings.transitionDuration)
            .attr("style", "opacity: " + cell_complex_settings.opacity);
        }
      });
      morseGraph.forEach(n => {
        d3.select(`#node${n.node}`)
          .transition().duration(general_settings.transitionDuration)
          .attr("style", "fill-opacity: " + cell_complex_settings.opacity);
      });
    }
  });

  var arr_size = document.getElementById("arr_size");

  arr_size.addEventListener("change", e => {
    if (general_settings.current_dim == 2) {
      arrow_settings.factor = e.target.value;

      d3.selectAll(".singleArrow").remove();
      d3.selectAll(".doubleArrow").remove();
      d3.selectAll(".selfArrow").remove();
      plotArrows();

      if (cell_complex_settings.showArrows == 1) {
        d3.selectAll(".doubleArrow").style("display", "none");
        d3.selectAll(".selfArrow").style("display", "none");
      }
      else if (cell_complex_settings.showArrows == 2) {
        d3.selectAll(".singleArrow").style("display", "none");
        d3.selectAll(".selfArrow").style("display", "none");
      }
      else if (cell_complex_settings.showArrows == 3) {
        d3.selectAll(".singleArrow").style("display", "none");
        d3.selectAll(".doubleArrow").style("display", "none");
      }
      else if (cell_complex_settings.showArrows == 4) {
        d3.selectAll(".selfArrow").style("display", "none");
      }
      else if (cell_complex_settings.showArrows == 5) {
        d3.selectAll(".singleArrow").style("display", "none");
        d3.selectAll(".doubleArrow").style("display", "none");
        d3.selectAll(".selfArrow").style("display", "none");
      }
    }
  });

  var arrow_select = document.getElementById("arrows");

  arrow_select.addEventListener("change", e => {
    if (general_settings.current_dim == 2) {
      cell_complex_settings.showArrows = e.target.value;

      if (cell_complex_settings.showArrows == 0) {
        d3.selectAll(".singleArrow").attr("style", "");
        d3.selectAll(".doubleArrow").attr("style", "");
        d3.selectAll(".selfArrow").attr("style", "");
      }
      else if (cell_complex_settings.showArrows == 1) {
        d3.selectAll(".singleArrow").attr("style", "");
        d3.selectAll(".doubleArrow").attr("style", "display: none");
        d3.selectAll(".selfArrow").attr("style", "display: none");
      }
      else if (cell_complex_settings.showArrows == 2) {
        d3.selectAll(".singleArrow").attr("style", "display: none");
        d3.selectAll(".doubleArrow").attr("style", "");
        d3.selectAll(".selfArrow").attr("style", "display: none");
      }
      else if (cell_complex_settings.showArrows == 3) {
        d3.selectAll(".singleArrow").attr("style", "display: none");
        d3.selectAll(".doubleArrow").attr("style", "display: none");
        d3.selectAll(".selfArrow").attr("style", "");
      }
      else if (cell_complex_settings.showArrows == 4) {
        d3.selectAll(".singleArrow").attr("style", "");
        d3.selectAll(".doubleArrow").attr("style", "");
        d3.selectAll(".selfArrow").attr("style", "display: none");
      }
      else {
        d3.selectAll(".singleArrow").attr("style", "display: none");
        d3.selectAll(".doubleArrow").attr("style", "display: none");
        d3.selectAll(".selfArrow").attr("style", "display: none");
      }
    }
  });

  var show_wireframe = document.getElementById("wireframe");

  show_wireframe.addEventListener("change", e => {
    if (general_settings.current_dim == 2) {
      cell_complex_settings.wireframe = e.target.value;
      if (cell_complex_settings.wireframe == 2) {
        d3.selectAll(".cell_dim1").attr("style", "display: none");
        d3.selectAll(".cell_dim0").attr("style", "display: none");
      }
      else {
        d3.selectAll(".cell_dim1").attr("style", "");
        d3.selectAll(".cell_dim0").attr("style", "");
      }
    }
  });

  var select_method = document.getElementById("select_method");

  select_method.addEventListener("change", e => {
    if (general_settings.current_dim == 2) {
      morse_graph_settings.selectMethod = e.target.value;
    }
  });

  var complex_line_width = document.getElementById("line_width");

  complex_line_width.addEventListener("change", e => {
    if (general_settings.current_dim == 2) {
      cell_complex_settings.lineWidth = parseFloat(e.target.value);
      cell_complex_settings.vertSize = parseFloat(e.target.value);
      d3.selectAll(".cell_dim1").attr("stroke-width", cell_complex_settings.lineWidth);
      d3.selectAll(".cell_dim0").attr("r", cell_complex_settings.vertSize + 1.0);
    }
  });

  if (general_settings.has_eq_cells) {
    d_eqCells.forEach(cell_ind => {
      var cx = 0, cy = 0;
      var cell;
      cells.forEach(c => {
        if (c.cell_index == cell_ind) {
          cell = c;
          return;
        }
      });

      var verts = cell.cell_verts;
      verts.forEach(v => {
        cx += cellComplexXScale(verts_coords[v][0]);
        cy += cellComplexYScale(verts_coords[v][1]);
      });

      cx /= verts.length;
      cy /= verts.length;

      svg.append("circle")
        .attr("r", cell_complex_settings.self_arrow_size)
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("fill", cell_complex_settings.eq_cell_color)
        .attr("class", "eq_cell")
        .attr("id", `eq_cell${cell_ind}`);
    });
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////  3D  ///////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function loadJSON_3D(d_complex, d_mg, d_ms, d_stg, d_eqCells) {

  general_settings.current_dim = 3;
  document.getElementById("space_dim_selected").innerHTML = `Phase dimension: 3`;

  d3.select("#myDiv").style("transform", "scale(1,1)");

  Plotly.newPlot("myDiv", []);

  document.getElementById("morse_graph").innerHTML = "";
  document.getElementById("myDiv").innerHTML = "";

  document.getElementById("arrows").innerHTML = `<option value="0" id="a0">All</option>
    <option value="1" id="a1">Single arrows only</option>
    <option value="2" id="a2">Double arrows only</option>
    <option value="3" id="a3">Self arrows only</option>
    <option value="4" id="a4">Single and double arrows</option>
    <option value="5" id="a5" selected="selected">None</option>`;

  cell_complex_settings.showArrows = 5;

  document.getElementById("wireframe").innerHTML = `<option value="0" id="w0" selected="selected">All</option>
    <option value="1" id="w1">Only selected morse sets</option>
    <option value="2" id="w2">None</option>`;

  cell_complex_settings.wireframe = 0;

  const graphSVG = d3.select("#morse_graph")
    .append("svg")
    .attr("width", morse_graph_settings.width)
    .attr("height", morse_graph_settings.height)
    .attr("transform", `translate(0, ${morse_graph_settings.moveDown})`);

  graphSVG.append("defs").append("marker")
    .attr("id", "triangle")
    .attr("refX", 5)
    .attr("refY", 5)
    .attr("markerWidth", 5)
    .attr("markerHeight", 5)
    .attr("viewBox", "0 0 10 10")
    .attr("orient", "auto-start-reverse")
    .append("polyline")
    .attr("points", "0 0, 10 5, 0 10, 0 0")
    .attr("fill", arrow_settings.single_color)
    .attr("stroke", arrow_settings.single_color);

  var complex = d_complex;
  var dimension = complex.dimension;
  var verts_coords = complex.verts_coords;
  var cells = complex.cells;

  var morseGraph = d_mg;
  var nodeLabels = morseGraph.map(d => d.label);
  var nodeRanks = morseGraph.map(d => parseInt(d.rank));
  var morseSets = d_ms;
  var stg = d_stg;

  var face_1d = [];
  var face_2d = [];
  var face_3d = [];

  cells.forEach(cell => {
    if (cell.cell_dim == 1) { face_1d.push(cell) }
    else if (cell.cell_dim == 2) { face_2d.push(cell); }
    else if (cell.cell_dim == 3) { face_3d.push(cell); }
  });

  var edges = [];

  face_1d.forEach(c => {
    edges.push(c.cell_verts);
  });

  function getSelectedEdges(selected_color) {
    var res_edges = [];
    var selected_morse;

    morseSets.forEach(m => {
      if (m.index == selected_color) {
        selected_morse = m;
      }
    });

    selected_morse.cells.forEach(c => {
      var cell_edges = [];
      var cell3d;

      face_3d.forEach(f => {
        if (f.cell_index == c) {
          cell3d = f;
        }
      });

      edges.forEach(e => {
        if (cell3d.cell_verts.includes(e[0]) && cell3d.cell_verts.includes(e[1])) {
          cell_edges.push(e);
        }
      });
      res_edges.push(cell_edges);
    });

    return res_edges;
  }

  function getSelectedEdges_old(selected_color) {
    var res_edges = [];
    var selected_morse;

    morseSets.forEach(m => {
      if (colorMap(m.index) == selected_color) {
        selected_morse = m;
      }
    });

    selected_morse.cells.forEach(c => {
      var cell3d;

      face_3d.forEach(f => {
        if (f.cell_index == c) {
          cell3d = f;
        }
      });

      edges.forEach(e => {
        if (cell3d.cell_verts.includes(e[0]) && cell3d.cell_verts.includes(e[1])) {
          res_edges.push(e);
        }
      });
    });

    return res_edges;
  }

  function getDist(curr_vert, target) {
    var x1 = verts_coords[curr_vert][0];
    var y1 = verts_coords[curr_vert][1];
    var z1 = verts_coords[curr_vert][2];
    var x2 = verts_coords[target][0];
    var y2 = verts_coords[target][1];
    var z2 = verts_coords[target][2];

    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2);
  }

  function getTarget(curr_vert, unvisited_edges) {
    var target = unvisited_edges[0][0];
    var minDist = getDist(curr_vert, target);

    unvisited_edges.forEach(e => {
      var dist = getDist(curr_vert, e[0]);

      if (dist < minDist) {
        minDist = dist;
        target = e[0];
      }
      var dist = getDist(curr_vert, e[1]);

      if (dist < minDist) {
        minDist = dist;
        target = e[1];
      }
    });

    return target;
  }

  function nextVert_unvisited(curr_vert, unvisited_edges) {
    for (var i = 0; i < unvisited_edges.length; i++) {
      if (unvisited_edges[i][0] == curr_vert) {
        var next_vert = unvisited_edges[i][1];
        unvisited_edges[i] = unvisited_edges[unvisited_edges.length - 1];
        unvisited_edges.pop();
        return next_vert;
      }
      if (unvisited_edges[i][1] == curr_vert) {
        var next_vert = unvisited_edges[i][0];
        unvisited_edges[i] = unvisited_edges[unvisited_edges.length - 1];
        unvisited_edges.pop();
        return next_vert;
      }
    }
    return -1;
  }

  function nextVert_visited(curr_vert, target, edge_list) {
    var min_dist = 1000;
    var next_vert = -1;

    edge_list.forEach(e => {
      if (e[0] == curr_vert) {
        var dist = getDist(e[1], target);
        if (dist < min_dist) {
          min_dist = dist;
          next_vert = e[1];
        }
      }
      else if (e[1] == curr_vert) {
        var dist = getDist(e[0], target);
        if (dist < min_dist) {
          min_dist = dist;
          next_vert = e[0];
        }
      }
    });

    return next_vert;
  }

  function sortVerts(edge_list) {
    var curr_vert = edge_list[0][0];
    var sorted_verts = [curr_vert];
    var unvisited_edges = [];

    edge_list.forEach(e => { unvisited_edges.push(e) });

    while (unvisited_edges.length > 0) {
      var next_vert = nextVert_unvisited(curr_vert, unvisited_edges);
      if (next_vert == -1) {
        var target = getTarget(curr_vert, unvisited_edges);
        next_vert = nextVert_visited(curr_vert, target, edge_list);
      }
      sorted_verts.push(next_vert);
      curr_vert = next_vert;
    }

    return sorted_verts;
  }

  var cellFaceMap = new Array(cells.length).fill(null);

  face_2d.forEach(f2d => {
    face_3d.forEach(f3d => {

      var f2d_verts = f2d.cell_verts;
      var f3d_verts = f3d.cell_verts;

      if (f2d_verts.every(v => f3d_verts.includes(v))) {
        if (cellFaceMap[f2d.cell_index] == undefined || cellFaceMap[f2d.cell_index] == null) {
          cellFaceMap[f2d.cell_index] = [];
        }
        cellFaceMap[f2d.cell_index].push(f3d.cell_index);
      }

    });
  });

  // Given 2D face, returns 3D cell it belongs to
  function get3DCell(cellInd_2d) {
    return cellFaceMap[cellInd_2d];
  }

  var morseSetMap = new Array(cells.length).fill(null);

  face_3d.forEach(f3d => {
    morseSets.forEach(ms => {

      if (ms.cells.includes(f3d.cell_index)) {
        morseSetMap[f3d.cell_index] = ms.index;
      }

    });
  });

  // Given 3D cell, returns morse set it belongs to
  function morseSetNum(cellInd_3d) {
    return morseSetMap[cellInd_3d];
  }

  function meshArrowData(p0, p1) {
    var r = arrow_settings.cone_radius;

    var x0 = p0[0], y0 = p0[1], z0 = p0[2], x1 = p1[0], y1 = p1[1], z1 = p1[2];
    var v1 = [], v2 = [];

    // n is the normal vector to the plane
    var n = [x1 - x0, y1 - y0, z1 - z0];

    // Ax + By + Cz + D = 0 is the plane equation
    var A = n[0], B = n[1], C = n[2], D = -n[0] * x0 - n[1] * y0 - n[2] * z0;

    var p2;

    if (A != 0) {
      if (y0 != 0 || z0 != 0) {
        p2 = [-D / A, 0, 0];
      }
      else {
        p2 = [-(D + B) / A, 1, 0];
      }
    }
    else if (B != 0) {
      if (x0 != 0 || z0 != 0) {
        p2 = [0, -D / B, 0];
      }
      else {
        p2 = [1, -(D + A) / B, 0];
      }
    }
    else { // C != 0
      if (x0 != 0 || y0 != 0) {
        p2 = [0, 0, -D / C];
      }
      else {
        p2 = [1, 0, -(D + A) / C];
      }
    }

    v1 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    // v2 = n x v1
    v2 = [n[1] * v1[2] - n[2] * v1[1], n[2] * v1[0] - n[0] * v1[2], n[0] * v1[1] - n[1] * v1[0]];

    //normalize v1, v2
    var n1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2);
    var n2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2);
    v1[0] /= n1;
    v1[1] /= n1;
    v1[2] /= n1;
    v2[0] /= n2;
    v2[1] /= n2;
    v2[2] /= n2;

    //circle equation
    var coneBase = (t) => [p0[0] + r * Math.cos(t) * v1[0] + r * Math.sin(t) * v2[0],
    p0[1] + r * Math.cos(t) * v1[1] + r * Math.sin(t) * v2[1],
    p0[2] + r * Math.cos(t) * v1[2] + r * Math.sin(t) * v2[2]];

    var delta_t = 2 * Math.PI / arrow_settings.cone_num_base_points;
    var base_points = [];

    for (var i = 0; i < arrow_settings.cone_num_base_points; i++) {
      base_points.push(coneBase(delta_t * i));
    }

    return base_points;
  }

  function range(size, startAt) {
    return [...Array(size).keys()].map(i => i + startAt);
  }

  function coneArrowData(p0, p1) {
    var points = meshArrowData(p0, p1);

    var cones = {
      x: [],
      y: [],
      z: [],
      i: [],
      j: [],
      k: [],
      hoverinfo: "none",
      flatshading: true,
      type: "mesh3d"
    };

    points.forEach(p => {
      cones.x.push(p[0]);
      cones.y.push(p[1]);
      cones.z.push(p[2]);
    });


    cones.i = cones.i.concat(range(cones.x.length, 0));
    cones.j = cones.j.concat(range(cones.x.length - 1, 1));
    cones.j.push(0);
    cones.k = cones.k.concat(new Array(cones.x.length).fill(cones.x.length));

    cones.i = cones.i.concat(range(cones.x.length, 0));
    cones.j = cones.j.concat(range(cones.x.length - 1, 1));
    cones.j.push(0);
    cones.k = cones.k.concat(new Array(cones.x.length).fill(cones.x.length + 1));

    cones.x.push(p0[0], p1[0]);
    cones.y.push(p0[1], p1[1]);
    cones.z.push(p0[2], p1[2]);

    return cones;
  }

  function createArrowData(cell1, cell2) {
    var c1, c2;

    face_3d.forEach(c => {
      if (c.cell_index == cell1) {
        c1 = c;
      }
      else if (c.cell_index == cell2) {
        c2 = c;
      }
    });

    var x_mid1 = 0, y_mid1 = 0, z_mid1 = 0, x_mid2 = 0, y_mid2 = 0, z_mid2 = 0, x_mid_face = 0, y_mid_face = 0, z_mid_face = 0;

    var c1_verts = c1.cell_verts;
    var c2_verts = c2.cell_verts;

    var cent_face_verts = [];

    c1_verts.forEach(c1v => {
      if (c2_verts.includes(c1v)) {
        cent_face_verts.push(c1v);
      }
    });

    cent_face_verts.forEach(v => {
      x_mid_face += verts_coords[v][0];
      y_mid_face += verts_coords[v][1];
      z_mid_face += verts_coords[v][2];
    });

    x_mid_face /= cent_face_verts.length;
    y_mid_face /= cent_face_verts.length;
    z_mid_face /= cent_face_verts.length;

    c1_verts.forEach(v => {
      x_mid1 += verts_coords[v][0];
      y_mid1 += verts_coords[v][1];
      z_mid1 += verts_coords[v][2];
    });

    x_mid1 /= c1_verts.length;
    y_mid1 /= c1_verts.length;
    z_mid1 /= c1_verts.length;

    c2_verts.forEach(v => {
      x_mid2 += verts_coords[v][0];
      y_mid2 += verts_coords[v][1];
      z_mid2 += verts_coords[v][2];
    });

    x_mid2 /= c2_verts.length;
    y_mid2 /= c2_verts.length;
    z_mid2 /= c2_verts.length;

    var vec = new Array(3);

    vec[0] = x_mid2 - x_mid_face;
    vec[1] = y_mid2 - y_mid_face;
    vec[2] = z_mid2 - z_mid_face;

    var norm_v = Math.sqrt(vec[0] ** 2 + vec[1] ** 2 + vec[2] ** 2);

    vec[0] *= (arrow_settings.size / 2) / norm_v;
    vec[1] *= (arrow_settings.size / 2) / norm_v;
    vec[2] *= (arrow_settings.size / 2) / norm_v;

    var p0 = [x_mid_face - (arrow_settings.factor * vec[0]), y_mid_face - (arrow_settings.factor * vec[1]), z_mid_face - (arrow_settings.factor * vec[2])];
    var p1 = [x_mid_face + (arrow_settings.factor * vec[0]), y_mid_face + (arrow_settings.factor * vec[1]), z_mid_face + (arrow_settings.factor * vec[2])];

    return coneArrowData(p0, p1);
  }

  function createDobleArrowData(cell1, cell2) {
    var c1, c2;

    face_3d.forEach(c => {
      if (c.cell_index == cell1) {
        c1 = c;
      }
      else if (c.cell_index == cell2) {
        c2 = c;
      }
    });

    var x_mid1 = 0, y_mid1 = 0, z_mid1 = 0, x_mid2 = 0, y_mid2 = 0, z_mid2 = 0, x_mid_face = 0, y_mid_face = 0, z_mid_face = 0;

    var c1_verts = c1.cell_verts;
    var c2_verts = c2.cell_verts;

    var cent_face_verts = [];

    c1_verts.forEach(c1v => {
      if (c2_verts.includes(c1v)) {
        cent_face_verts.push(c1v);
      }
    });

    cent_face_verts.forEach(v => {
      x_mid_face += verts_coords[v][0];
      y_mid_face += verts_coords[v][1];
      z_mid_face += verts_coords[v][2];
    });

    x_mid_face /= cent_face_verts.length;
    y_mid_face /= cent_face_verts.length;
    z_mid_face /= cent_face_verts.length;

    c1_verts.forEach(v => {
      x_mid1 += verts_coords[v][0];
      y_mid1 += verts_coords[v][1];
      z_mid1 += verts_coords[v][2];
    });

    x_mid1 /= c1_verts.length;
    y_mid1 /= c1_verts.length;
    z_mid1 /= c1_verts.length;

    c2_verts.forEach(v => {
      x_mid2 += verts_coords[v][0];
      y_mid2 += verts_coords[v][1];
      z_mid2 += verts_coords[v][2];
    });

    x_mid2 /= c2_verts.length;
    y_mid2 /= c2_verts.length;
    z_mid2 /= c2_verts.length;

    var vec = new Array(3);

    vec[0] = x_mid2 - x_mid_face;
    vec[1] = y_mid2 - y_mid_face;
    vec[2] = z_mid2 - z_mid_face;

    var norm_v = Math.sqrt(vec[0] ** 2 + vec[1] ** 2 + vec[2] ** 2);

    vec[0] *= (arrow_settings.size) / norm_v;
    vec[1] *= (arrow_settings.size) / norm_v;
    vec[2] *= (arrow_settings.size) / norm_v;

    var p0 = [x_mid_face, y_mid_face, z_mid_face];
    var p1 = [x_mid_face - (arrow_settings.factor * vec[0]), y_mid_face - (arrow_settings.factor * vec[1]), z_mid_face - (arrow_settings.factor * vec[2])];
    var p2 = [x_mid_face + (arrow_settings.factor * vec[0]), y_mid_face + (arrow_settings.factor * vec[1]), z_mid_face + (arrow_settings.factor * vec[2])];

    return [coneArrowData(p0, p1), coneArrowData(p0, p2)];
  }

  function createSelfArrowData(arrow_data) {
    var res_data = {
      x: [],
      y: [],
      z: [],
      lighting: {
        ambient: 1,
        diffuse: 1,
        specular: 2,
        roughness: 1,
        fresnel: 5
      },
      mode: 'markers',
      hoverinfo: "none",
      marker: { size: arrow_settings.self_arrow_size, color: '#137a01' },
      type: 'scatter3d'
    };

    arrow_data.forEach(arr => {
      var cell;
      face_3d.forEach(c => {
        if (c.cell_index == parseInt(arr)) {
          cell = c;
        }
      });

      var cell_verts = cell.cell_verts;
      var x_mid = 0, y_mid = 0, z_mid = 0;

      cell_verts.forEach(v => {
        x_mid += verts_coords[v][0];
        y_mid += verts_coords[v][1];
        z_mid += verts_coords[v][2];
      });

      x_mid /= cell_verts.length;
      y_mid /= cell_verts.length;
      z_mid /= cell_verts.length;

      res_data.x.push(x_mid);
      res_data.y.push(y_mid);
      res_data.z.push(z_mid);

    });

    return res_data;
  }

  function createEqCellData(cellInds) {

    var res_data = {
      x: [],
      y: [],
      z: [],
      lighting: {
        ambient: 1,
        diffuse: 1,
        specular: 2,
        roughness: 1,
        fresnel: 5
      },
      mode: 'markers',
      hoverinfo: "none",
      marker: { size: arrow_settings.self_arrow_size, color: cell_complex_settings.eq_cell_color },
      type: 'scatter3d'
    };

    cellInds.forEach(ind => {
      var cell;
      cells.forEach(c => {
        if (c.cell_index == parseInt(ind)) {
          cell = c;
        }
      });

      var cell_verts = cell.cell_verts;
      var x_mid = 0, y_mid = 0, z_mid = 0;

      cell_verts.forEach(v => {
        x_mid += verts_coords[v][0];
        y_mid += verts_coords[v][1];
        z_mid += verts_coords[v][2];
      });

      x_mid /= cell_verts.length;
      y_mid /= cell_verts.length;
      z_mid /= cell_verts.length;

      res_data.x.push(x_mid);
      res_data.y.push(y_mid);
      res_data.z.push(z_mid);

    });

    return res_data;
  }

  function cell_dim2_data(cell, colorInd) {
    var verts = cell.cell_verts;
    var coords = verts.map(vert => verts_coords[vert]);

    var x = coords.map(coord => coord[0]);
    var y = coords.map(coord => coord[1]);
    var z = coords.map(coord => coord[2]);

    var color;

    if (colorInd == null || colorInd == undefined) {
      color = cell_complex_settings.no_ms_color;
    }
    else {
      color = colorMap(colorInd);
    }

    var i = [];
    var j = [];
    var k = [];

    if (verts.length == 3) {
      i = [verts[0]];
      j = [verts[1]];
      k = [verts[2]];
    }
    else if (verts.length == 4) {
      i = [verts[0], verts[2]];
      j = [verts[1], verts[3]];
      k = [verts[2], verts[0]];
    }
    else {
      var cx = 0;
      x.forEach(xVal => { cx += xVal });

      var cy = 0;
      y.forEach(yVal => { cy += yVal });

      var cz = 0;
      z.forEach(zVal => { cz += zVal });

      var center = [cx / x.length, cy / y.length, cz / z.length];

      if (general_settings.firstRun == true) {
        verts_coords.push(center);
        verts.push(verts_coords.length - 1);
        x.push(cx / x.length);
        y.push(cy / y.length);
        z.push(cz / z.length);
        general_settings.firstRun = false;
      }

      for (var n = 0; n < x.length - 1; n++) {
        if (n == x.length - 2) {
          i.push(verts[n]);
          j.push(verts[x.length - 1]);
          k.push(verts[0]);
        }
        else {
          i.push(verts[n]);
          j.push(verts[x.length - 1]);
          k.push(verts[n + 1]);
        }
      }
    }

    return [i, j, k, color, verts.length];
  }

  function drawNode(nodeInd, xPos, yPos) {

    var label = nodeLabels[nodeInd];

    graphSVG.append("ellipse")
      .attr("rx", morse_graph_settings.node_rx)
      .attr("ry", morse_graph_settings.node_ry)
      .attr("cx", xPos)
      .attr("cy", yPos)
      .attr("stroke", "black")
      .attr("stroke-width", 1.5)
      .attr("id", `whitenode${nodeInd}`)
      .attr("class", "nodes ellipse")
      .attr("fill", "white");

    graphSVG.append("ellipse")
      .attr("rx", morse_graph_settings.node_rx)
      .attr("ry", morse_graph_settings.node_ry)
      .attr("cx", xPos)
      .attr("cy", yPos)
      .attr("stroke", "black")
      .attr("stroke-width", 1.5)
      .attr("id", `node${nodeInd}`)
      .attr("class", "nodes ellipse")
      .attr("fill", colorMap(nodeInd))
      .attr("style", `fill-opacity: ${morse_graph_settings.opacity}`);

    graphSVG.append("text")
      .attr("text-anchor", "middle")
      .attr("x", xPos)
      .attr("y", yPos + 4)
      .attr("font-size", morse_graph_settings.label_font_size)
      .attr("class", "nodes text")
      .attr("id", `text${nodeInd}`)
      .html(label);

  }

  var maxDepth = Math.max.apply(Math, nodeRanks);
  var ySize = morse_graph_settings.height / (maxDepth + 1);

  if (maxDepth == 1) {
    var thisRank = [];

    for (var j = 0; j < nodeRanks.length; j++) {
      if (nodeRanks[j] == 1) {
        thisRank.push(j);
      }
    }

    var xSize = morse_graph_settings.width / thisRank.length;

    if (thisRank.length == 2) {
      drawNode(thisRank[0], morse_graph_settings.width / 2 - 100, morse_graph_settings.height / 2 - 50);
      drawNode(thisRank[1], morse_graph_settings.width / 2 + 100, morse_graph_settings.height / 2 - 50);
    }
    else {
      thisRank.forEach(nodeIndex => {
        var x = thisRank.indexOf(nodeIndex) * xSize + xSize / 2;
        var y = morse_graph_settings.height / 2 - 50;

        drawNode(nodeIndex, x, y);
      });
    }

    var thisRank = [];

    for (var j = 0; j < nodeRanks.length; j++) {
      if (nodeRanks[j] == 0) {
        thisRank.push(j);
      }
    }

    var xSize = morse_graph_settings.width / thisRank.length;

    if (thisRank.length == 2) {
      drawNode(thisRank[0], morse_graph_settings.width / 2 - 100, morse_graph_settings.height / 2 + 50);
      drawNode(thisRank[1], morse_graph_settings.width / 2 + 100, morse_graph_settings.height / 2 + 50);
    }
    else {
      thisRank.forEach(nodeIndex => {
        var x = thisRank.indexOf(nodeIndex) * xSize + xSize / 2;
        var y = morse_graph_settings.height / 2 + 50;

        drawNode(nodeIndex, x, y);
      });
    }
  }
  else {
    for (var i = 0; i <= maxDepth; i++) {
      var thisRank = [];

      for (var j = 0; j < nodeRanks.length; j++) {
        if (nodeRanks[j] == i) {
          thisRank.push(j);
        }
      }

      var xSize = morse_graph_settings.width / thisRank.length;

      if (thisRank.length == 2) {
        drawNode(thisRank[0], morse_graph_settings.width / 2 - 100, (maxDepth - i) * ySize + ySize / 2);
        drawNode(thisRank[1], morse_graph_settings.width / 2 + 100, (maxDepth - i) * ySize + ySize / 2);
      }
      else {
        thisRank.forEach(nodeIndex => {
          var x = thisRank.indexOf(nodeIndex) * xSize + xSize / 2;
          var y = (maxDepth - i) * ySize + ySize / 2;

          drawNode(nodeIndex, x, y);
        });
      }
    }
  }

  function drawArrowMorse(x1, y1, xMid, yMid, x2, y2, cellFromInd, cellToInd) {

    var triSize = arrow_settings.tip_dims / 2 * arrow_settings.line_width;
    var arrowLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    var t0 = 1 - triSize / arrowLength;
    var xFinal = (1 - t0) * x1 + t0 * x2;
    var yFinal = (1 - t0) * y1 + t0 * y2;

    graphSVG.append("path")
      .attr("d", `M ${x1} ${y1} Q ${xMid} ${yMid} ${xFinal} ${yFinal}`)
      .attr("id", `${cellFromInd}arrow${cellToInd}`)
      .attr("stroke-width", arrow_settings.line_width)
      .attr("stroke", arrow_settings.single_color)
      .attr("marker-end", "url(#triangle)");
  }

  function findInterval(n1, n2) {
    var node1, node2;

    if (morseGraph[n1].rank > morseGraph[n2].rank) {
      node1 = n1;
      node2 = n2;
    }
    else {
      node1 = n2;
      node2 = n1;
    }

    var result = [node1];

    if (node1 == node2) {
      return result;
    }

    if (morseGraph[node1].rank == morseGraph[node2].rank) {
      return [];
    }

    morseGraph[node1].adjacencies.forEach(adj => {
      if (morseGraph[adj].rank >= morseGraph[node2].rank) {
        var temp = findInterval(adj, node2);

        if (temp.length > 0) {
          temp.forEach(t => {
            if (!result.includes(t)) {
              result.push(t);
            }
          });
        }
      }
    });

    if (result.length > 1) {
      return result;
    }
    else {
      return [];
    }
  }

  morseGraph.forEach(graphNode => {
    graphNode.adjacencies.forEach(edgeTo => {

      var x1 = parseInt(document.getElementById(`node${graphNode.node}`).getAttribute("cx"));
      var y1 = parseInt(document.getElementById(`node${graphNode.node}`).getAttribute("cy"));
      var x2 = parseInt(document.getElementById(`node${edgeTo}`).getAttribute("cx"));
      var y2 = parseInt(document.getElementById(`node${edgeTo}`).getAttribute("cy"));

      var disloc = (x2 - x1) + (y2 - y1);

      var arrowPosChange;

      if (x1 < x2 && disloc >= 0) {
        arrowPosChange = -disloc * morse_graph_settings.position_scale;
      }
      else if (x1 < x2 && disloc < 0) {
        arrowPosChange = disloc * morse_graph_settings.position_scale;
      }
      else if (x1 == x2) {
        arrowPosChange = 0;
      }
      else if (x1 > x2 && disloc >= 0) {
        arrowPosChange = disloc * morse_graph_settings.position_scale * 3;
      }
      else {
        arrowPosChange = -disloc * morse_graph_settings.position_scale * 3;
      }

      var x1final = x1;
      var y1final = y1 + morse_graph_settings.node_ry;
      var x2final = x2 + arrowPosChange;
      var y2final = y2 - morse_graph_settings.node_ry;

      var edgeToObj;

      morseGraph.forEach(toNode => {
        if (toNode.node == edgeTo) {
          edgeToObj = toNode;
        }
      });

      var xMid;
      var yMid;

      if ((graphNode.rank - edgeToObj.rank) > 1) {
        var xMidTemp = (x1final + x2final) / 2;
        var targetRank = edgeToObj.rank + 1;
        var targetRankNodes = [];
        var xTargetNodes = [];

        morseGraph.forEach(node => {
          if (node.rank == targetRank) {
            targetRankNodes.push(d3.select(`#node${node.node}`));
          }
        });

        targetRankNodes.forEach(n => {
          xTargetNodes.push(n._groups[0][0].getAttribute("cx"));
          yMid = n._groups[0][0].getAttribute("cy");
        });

        var nearestNode1, nearestNode2;

        if (xTargetNodes.length == 1) {
          if (x2final > x1final) {
            xMid = (morse_graph_settings.width + parseInt(xTargetNodes[0])) / 2;
          }
          else {
            xMid = xTargetNodes[0] / 2;
          }
        }
        else if (xTargetNodes.length == 2) {
          nearestNode1 = xTargetNodes[0];
          nearestNode2 = xTargetNodes[1];
          xMid = (parseInt(nearestNode2) + parseInt(nearestNode1)) / 2;
        }
        else if (xTargetNodes.length > 2) {
          nearestNode1 = xTargetNodes[0];
          nearestNode2 = xTargetNodes[1];
          for (var i = 2; i < xTargetNodes.length; i++) {
            if (Math.abs(xTargetNodes[i] - xMidTemp) < Math.abs(nearestNode1 - xMidTemp) && Math.abs(xTargetNodes[i] - xMidTemp) < Math.abs(nearestNode2 - xMidTemp)) {
              if (Math.abs(nearestNode1 - xMidTemp) < Math.abs(nearestNode2 - xMidTemp)) {
                nearestNode2 = xTargetNodes[i];
              }
              else {
                nearestNode1 = xTargetNodes[i];
              }
            }
            else if (Math.abs(xTargetNodes[i] - xMidTemp) <= Math.abs(nearestNode1 - xMidTemp) && Math.abs(xTargetNodes[i] - xMidTemp) > Math.abs(nearestNode2 - xMidTemp)) {
              nearestNode1 = xTargetNodes[i];
            }
            else if (Math.abs(xTargetNodes[i] - xMidTemp) > Math.abs(nearestNode1 - xMidTemp) && Math.abs(xTargetNodes[i] - xMidTemp) <= Math.abs(nearestNode2 - xMidTemp)) {
              nearestNode2 = xTargetNodes[i];
            }
          }

          xMid = (parseInt(nearestNode2) + parseInt(nearestNode1)) / 2;
        }
        else {
          console.log("error: no nodes at target rank");
        }

        if (Math.abs(x1final - xMid) <= 1 && Math.abs(x2final - xMid) <= 1) {
          if (x2final > morse_graph_settings.width / 2) {
            xMid = (x1final + x2final) / 2 + Math.sqrt(Math.pow((y2final - y1final), 2) + Math.pow((x2final - x1final), 2)) * morse_graph_settings.arrow_curvature;
          }
          else {
            xMid = (x1final + x2final) / 2 - Math.sqrt(Math.pow((y2final - y1final), 2) + Math.pow((x2final - x1final), 2)) * morse_graph_settings.arrow_curvature;
          }
        }
      }
      else {
        yMid = (y1final + y2final) / 2;

        if (x1final > x2final) {
          xMid = (x1final + x2final) / 2 - Math.sqrt(Math.pow((y2final - y1final), 2) + Math.pow((x2final - x1final), 2)) * morse_graph_settings.arrow_curvature;
        }
        else if (x1final < x2final) {
          xMid = (x1final + x2final) / 2 + Math.sqrt(Math.pow((y2final - y1final), 2) + Math.pow((x2final - x1final), 2)) * morse_graph_settings.arrow_curvature;
        }
        else {
          if (x2final > morse_graph_settings.width / 2) {
            xMid = (x1final + x2final) / 2 + Math.sqrt(Math.pow((y2final - y1final), 2) + Math.pow((x2final - x1final), 2)) * morse_graph_settings.arrow_curvature / 5;
          }
          else {
            xMid = (x1final + x2final) / 2 - Math.sqrt(Math.pow((y2final - y1final), 2) + Math.pow((x2final - x1final), 2)) * morse_graph_settings.arrow_curvature / 5;
          }
        }
      }

      drawArrowMorse(x1final, y1final, xMid, yMid, x2final, y2final, `morsegraph${graphNode.node}`, edgeTo);
    });
  });

  function plotCells(cellsToPlot) {

    if (general_settings.selected_ms_3d.length > 0) {
      morseGraph.forEach(ms => {
        if (!general_settings.selected_ms_3d.includes(ms.node)) {
          d3.select(`#node${ms.node}`)
            .transition().duration(general_settings.transitionDuration)
            .attr("fill", "white");
        }
        else {
          d3.select(`#node${ms.node}`)
            .transition().duration(general_settings.transitionDuration)
            .attr("fill", colorMap(ms.node));
        }
      });
    }
    else {
      morseGraph.forEach(ms => {
        d3.select(`#node${ms.node}`)
          .transition().duration(general_settings.transitionDuration)
          .attr("fill", colorMap(ms.node));
      });
    }

    var gd = document.getElementById('myDiv');
    const allLines = fillRange(0, gd.data.length - 1);
    Plotly.deleteTraces(cell_complex_settings.div_name, allLines);

    var i = [];
    var j = [];
    var k = [];
    var facecolor = [];

    var dim1data = [];

    var layout1 = {
      showlegend: false,
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      scene: {
        xaxis: {
          backgroundcolor: "rgb(200, 200, 230)",
          gridcolor: "rgb(255, 255, 255)",
          zerolinecolor: "rgb(255, 255, 255)",
          ticktext: ['', '', '', '', '', '', '', '', ''],
          tickvals: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
          showbackground: true,
          title: 'x'
        },
        yaxis: {
          backgroundcolor: "rgb(200, 200, 230)",
          gridcolor: "rgb(255, 255, 255)",
          zerolinecolor: "rgb(255, 255, 255)",
          ticktext: ['', '', '', '', '', '', '', '', ''],
          tickvals: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
          showbackground: true,
          title: 'y'
        },
        zaxis: {
          backgroundcolor: "rgb(200, 200, 230)",
          gridcolor: "rgb(255, 255, 255)",
          zerolinecolor: "rgb(255, 255, 255)",
          ticktext: ['', '', '', '', '', '', '', '', ''],
          tickvals: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
          showbackground: true,
          title: 'z'
        }
        // xaxis: { nticks: 1, title: '' },
        // yaxis: { nticks: 1, title: '' },
        // zaxis: { nticks: 1, title: '' }
      }
    };

    var dim0_x = [];
    var dim0_y = [];
    var dim0_z = [];

    var tri_num = 0;

    cellsToPlot.forEach(cell => {

      if (cell.cell_dim == 0) {
        dim0_x.push(verts_coords[cell.cell_verts[0]][0]);
        dim0_y.push(verts_coords[cell.cell_verts[0]][1]);
        dim0_z.push(verts_coords[cell.cell_verts[0]][2]);
      }
      else if (cell.cell_dim == 2) {

        var cell_3d;

        if (get3DCell(cell.cell_index) == null) {
          cell_3d = null;
        }
        else if (get3DCell(cell.cell_index).length == 1) {
          cell_3d = get3DCell(cell.cell_index)[0];
        }
        else {
          if (general_settings.selected_ms_3d.length == 0) {
            if (morseSetNum(get3DCell(cell.cell_index)[0]) == morseSetNum(get3DCell(cell.cell_index)[1])) {
              cell_3d = get3DCell(cell.cell_index)[0];
            }
            else if (morseSetNum(get3DCell(cell.cell_index)[0]) == null || morseSetNum(get3DCell(cell.cell_index)[0]) == undefined) {
              cell_3d = get3DCell(cell.cell_index)[1];
            }
            else if (morseSetNum(get3DCell(cell.cell_index)[1]) == null || morseSetNum(get3DCell(cell.cell_index)[1]) == undefined) {
              cell_3d = get3DCell(cell.cell_index)[0];
            }
            else {
              var rank0;
              var rank1;

              morseGraph.forEach(m => {
                if (m.node == morseSetNum(get3DCell(cell.cell_index)[0])) {
                  rank0 = m.rank;
                }
                else if (m.node == morseSetNum(get3DCell(cell.cell_index)[1])) {
                  rank1 = m.rank;
                }
              });

              if (rank0 > rank1) {
                cell_3d = get3DCell(cell.cell_index)[0];
              }
              else {
                cell_3d = get3DCell(cell.cell_index)[1];
              }
            }
          }
          else {
            if (morseSetNum(get3DCell(cell.cell_index)[0]) == morseSetNum(get3DCell(cell.cell_index)[1])) {
              cell_3d = get3DCell(cell.cell_index)[0];
            }
            else if (morseSetNum(get3DCell(cell.cell_index)[0]) == null || morseSetNum(get3DCell(cell.cell_index)[0]) == undefined) {
              cell_3d = get3DCell(cell.cell_index)[1];
            }
            else if (morseSetNum(get3DCell(cell.cell_index)[1]) == null || morseSetNum(get3DCell(cell.cell_index)[1]) == undefined) {
              cell_3d = get3DCell(cell.cell_index)[0];
            }
            else {
              if (general_settings.selected_ms_3d.includes(morseSetNum(get3DCell(cell.cell_index)[0]))) {
                cell_3d = get3DCell(cell.cell_index)[0];
              }
              else {
                cell_3d = get3DCell(cell.cell_index)[1];
              }
            }
          }
        }

        var colorInd = morseSetNum(cell_3d);

        var data = cell_dim2_data(cell, colorInd);

        if (general_settings.selected_ms_3d.length == 0 || general_settings.selected_ms_3d.includes(colorInd)) {
          var color = data[3];

          data[0].forEach(i_data => i.push(i_data));
          data[1].forEach(j_data => j.push(j_data));
          data[2].forEach(k_data => k.push(k_data));

          if (data[4] < 5) {
            for (var c = 0; c < data[4] - 2; c++) {
              facecolor.push(color);
            }
          }
          else {
            for (var c = 0; c < data[4] - 1; c++) {
              facecolor.push(color);
            }
          }
        }
      }
    });

    var selected_edges;

    if (cell_complex_settings.wireframe == 0) {
      selected_edges = edges;

      var sorted_verts = sortVerts(selected_edges);

      var x = [];
      var y = [];
      var z = [];

      sorted_verts.forEach(v => {
        x.push(verts_coords[v][0]);
        y.push(verts_coords[v][1]);
        z.push(verts_coords[v][2]);
      });

      var data_dim1 = {
        type: "scatter3d",
        x: x,
        y: y,
        z: z,
        mode: "line",
        hoverinfo: "none",
        marker: { size: cell_complex_settings.vertSize, color: "#000000" },
        line: { width: cell_complex_settings.lineWidth }
      };

      dim1data.push(data_dim1);
    }
    else if (cell_complex_settings.wireframe == 1) {

      if (general_settings.selected_ms_3d.length == 0) {
        selected_edges = edges;

        var sorted_verts = sortVerts(selected_edges);

        var x = [];
        var y = [];
        var z = [];

        sorted_verts.forEach(v => {
          x.push(verts_coords[v][0]);
          y.push(verts_coords[v][1]);
          z.push(verts_coords[v][2]);
        });

        var data_dim1 = {
          type: "scatter3d",
          x: x,
          y: y,
          z: z,
          mode: "line",
          hoverinfo: "none",
          marker: { size: cell_complex_settings.vertSize, color: "#000000" },
          line: { width: cell_complex_settings.lineWidth }
        };

        dim1data.push(data_dim1);
      }
      else {
        var sel_edges = [];

        general_settings.selected_ms_3d.forEach(color => {
          var s_edges = getSelectedEdges(color);
          s_edges.forEach(e => {
            sel_edges.push(e);
          });
        });

        selected_edges = sel_edges;

        selected_edges.forEach(edge => {
          var sorted_verts = sortVerts(edge);

          var x = [];
          var y = [];
          var z = [];

          sorted_verts.forEach(v => {
            x.push(verts_coords[v][0]);
            y.push(verts_coords[v][1]);
            z.push(verts_coords[v][2]);
          });

          var data_dim1 = {
            type: "scatter3d",
            x: x,
            y: y,
            z: z,
            mode: "line",
            hoverinfo: "none",
            marker: { size: cell_complex_settings.vertSize, color: "#000000" },
            line: { width: cell_complex_settings.lineWidth }
          };

          dim1data.push(data_dim1);
        });
      }
    }

    var dim2data = [{
      x: verts_coords.map(v => v[0]),
      y: verts_coords.map(v => v[1]),
      z: verts_coords.map(v => v[2]),
      i: i,
      j: j,
      k: k,
      facecolor: facecolor,
      hoverinfo: "none",
      opacity: cell_complex_settings.opacity,
      flatshading: true,
      type: "mesh3d"
    }];

    var dim0data = [{
      x: dim0_x,
      y: dim0_y,
      z: dim0_z,
      mode: 'markers',
      hoverinfo: "none",
      marker: { size: 4, color: '#000000' },
      type: 'scatter3d'
    }];

    //////////////
    /// ARROWS ///
    //////////////

    if (cell_complex_settings.showArrows < 5) {

      var singleArrowData = [];
      var doubleArrowData = [];
      var selfArrowData = [];

      var single_arrows = [];
      var double_arrows = [];
      var self_arrows = [];

      stg.forEach(arr => {
        arr.adjacencies.forEach(adj => {
          if (general_settings.selected_ms_3d.length == 0 || general_settings.selected_ms_3d.includes(morseSetNum(arr.node)) || general_settings.selected_ms_3d.includes(morseSetNum(adj))) {
            if (arr.node != adj) {
              if (single_arrows.includes(`${adj}-${arr.node}`)) {
                double_arrows.push(`${arr.node}-${adj}`);
                single_arrows[single_arrows.indexOf(`${adj}-${arr.node}`)] = single_arrows[single_arrows.length - 1];
                single_arrows.pop();
              }
              else {
                single_arrows.push(`${arr.node}-${adj}`);
              }
            }
            else {
              self_arrows.push(`${arr.node}-${adj}`);
            }
          }
        });
      });

      var single_arrows_inds = single_arrows.map(arr => {
        var div_ind = arr.indexOf('-');
        return [arr.substring(0, div_ind), arr.substring(div_ind + 1, arr.length)];
      });

      var double_arrows_inds = double_arrows.map(arr => {
        var div_ind = arr.indexOf('-');
        return [arr.substring(0, div_ind), arr.substring(div_ind + 1, arr.length)];
      });

      var self_arrows_inds = self_arrows.map(arr => {
        var div_ind = arr.indexOf('-');
        return arr.substring(0, div_ind);
      });

      if (cell_complex_settings.showArrows == 0 || cell_complex_settings.showArrows == 1 || cell_complex_settings.showArrows == 4) {

        single_arrows_inds.forEach(arr => {
          singleArrowData.push(createArrowData(arr[0], arr[1]));
        });

      }

      if (cell_complex_settings.showArrows == 0 || cell_complex_settings.showArrows == 2 || cell_complex_settings.showArrows == 4) {

        double_arrows_inds.forEach(arr => {
          var dbl_data = createDobleArrowData(arr[0], arr[1]);
          doubleArrowData.push(dbl_data[0]);
          doubleArrowData.push(dbl_data[1]);
        });

      }

      if (cell_complex_settings.showArrows == 0 || cell_complex_settings.showArrows == 3) {
        selfArrowData = (createSelfArrowData(self_arrows_inds));
      }

      var merged_singleArrowData = {
        x: [],
        y: [],
        z: [],
        i: [],
        j: [],
        k: [],
        color: "#004dc9",
        hoverinfo: "none",
        flatshading: true,
        type: "mesh3d"
      };

      if (singleArrowData.length > 1) {
        for (var i = 0; i < singleArrowData.length; i++) {
          merged_singleArrowData.x = merged_singleArrowData.x.concat(singleArrowData[i].x);
          merged_singleArrowData.y = merged_singleArrowData.y.concat(singleArrowData[i].y);
          merged_singleArrowData.z = merged_singleArrowData.z.concat(singleArrowData[i].z);

          singleArrowData[i].i.forEach(d => { merged_singleArrowData.i.push(d + 12 * i); });
          singleArrowData[i].j.forEach(d => { merged_singleArrowData.j.push(d + 12 * i); });
          singleArrowData[i].k.forEach(d => { merged_singleArrowData.k.push(d + 12 * i); });
        }
      }

      var merged_doubleArrowData = {
        x: [],
        y: [],
        z: [],
        i: [],
        j: [],
        k: [],
        color: "#FF0000",
        hoverinfo: "none",
        flatshading: true,
        type: "mesh3d"
      };

      if (doubleArrowData.length > 1) {
        for (var i = 0; i < doubleArrowData.length; i++) {
          merged_doubleArrowData.x = merged_doubleArrowData.x.concat(doubleArrowData[i].x);
          merged_doubleArrowData.y = merged_doubleArrowData.y.concat(doubleArrowData[i].y);
          merged_doubleArrowData.z = merged_doubleArrowData.z.concat(doubleArrowData[i].z);

          doubleArrowData[i].i.forEach(d => { merged_doubleArrowData.i.push(d + 12 * i); });
          doubleArrowData[i].j.forEach(d => { merged_doubleArrowData.j.push(d + 12 * i); });
          doubleArrowData[i].k.forEach(d => { merged_doubleArrowData.k.push(d + 12 * i); });
        }
      }


      if (cell_complex_settings.showArrows == 0 || cell_complex_settings.showArrows == 1 || cell_complex_settings.showArrows == 4) {
        Plotly.plot(cell_complex_settings.div_name, [merged_singleArrowData], layout1);
      }
      if (cell_complex_settings.showArrows == 0 || cell_complex_settings.showArrows == 2 || cell_complex_settings.showArrows == 4) {
        Plotly.plot(cell_complex_settings.div_name, [merged_doubleArrowData], layout1);
      }
      if (cell_complex_settings.showArrows == 0 || cell_complex_settings.showArrows == 3) {
        Plotly.plot(cell_complex_settings.div_name, [selfArrowData], layout1);
      }

    }

    //////////////
    /// ARROWS ///
    //////////////

    //Plotly.plot(div, dim0data, layout1);
    Plotly.plot(cell_complex_settings.div_name, dim2data, layout1);
    Plotly.plot(cell_complex_settings.div_name, dim1data, layout1);

    if (general_settings.has_eq_cells) {
      var eqCellData = createEqCellData(d_eqCells);
      Plotly.plot(cell_complex_settings.div_name, [eqCellData], layout1);
    }
  }

  plotCells(cells);

  var graphNodes = d3.selectAll(".nodes.ellipse");
  var graphNodesText = d3.selectAll(".nodes.text");

  graphNodes
    .on("click", function () {
      handleNodeClick(d3.select(this));
    });

  graphNodesText
    .on("click", function () {
      handleNodeClick(d3.select(this));
    });

  var interval_node1 = null;
  var interval_node2 = null;

  const handleNodeClick = c => {

    console.log("clicked node", c);

    var click_id = c._groups[0][0].id;
    var click_ind = parseInt(click_id.substring(4, click_id.length));

    if (morse_graph_settings.selectMethod == 0) {
      interval_node1 = null;
      interval_node2 = null;

      if (general_settings.selected_ms_3d.includes(click_ind) && general_settings.selected_ms_3d.length == 1) {
        general_settings.selected_ms_3d = [];
        plotCells(cells);
      }
      else {
        general_settings.selected_ms_3d = [click_ind];
        plotCells(cells);
      }
    }
    else if (morse_graph_settings.selectMethod == 1) {
      interval_node1 = null;
      interval_node2 = null;

      if (general_settings.selected_ms_3d.includes(click_ind)) {

        if (general_settings.selected_ms_3d.length == 1) {
          general_settings.selected_ms_3d = [];
          plotCells(cells);
        }
        else {
          var ind = general_settings.selected_ms_3d.indexOf(click_ind);
          general_settings.selected_ms_3d[ind] = general_settings.selected_ms_3d[general_settings.selected_ms_3d.length - 1];
          general_settings.selected_ms_3d.pop();
          plotCells(cells);
        }

      }
      else {
        general_settings.selected_ms_3d.push(click_ind);
        plotCells(cells);
      }

    }
    else {
      invalid_interval_message();
      if (interval_node1 == null) {
        interval_node1 = click_ind;
        general_settings.selected_ms_3d = [click_ind];
        plotCells(cells);
      }
      else if (interval_node2 == null) {
        var interval = findInterval(interval_node1, click_ind);

        if (interval.length > 1) {
          interval_node2 = click_ind;
          interval.forEach(i => {
            general_settings.selected_ms_3d.push(i);
          });
          plotCells(cells);
        }
        else {
          interval_node1 = null;
          interval_node2 = null;
          general_settings.selected_ms_3d = [];
          plotCells(cells);

          d3.select("#messages")
            .style("display", "");

          setTimeout(invalid_interval_message, 5000);
        }
      }
      else {
        interval_node1 = click_ind;
        interval_node2 = null;
        general_settings.selected_ms_3d = [click_ind];
        plotCells(cells);
      }
    }

  };

  var arrow_select = document.getElementById("arrows");

  arrow_select.addEventListener("change", e => {
    if (general_settings.current_dim == 3) {
      cell_complex_settings.showArrows = e.target.value;
      plotCells(cells);
    }
  });

  var show_wireframe = document.getElementById("wireframe");

  show_wireframe.addEventListener("change", e => {
    if (general_settings.current_dim == 3) {
      cell_complex_settings.wireframe = e.target.value;
      plotCells(cells);
    }
  });

  var face_alpha = document.getElementById("face_alpha");

  face_alpha.addEventListener("change", e => {
    if (general_settings.current_dim == 3) {
      cell_complex_settings.opacity = e.target.value;
      plotCells(cells);
    }
  });

  var arr_size = document.getElementById("arr_size");

  arr_size.addEventListener("change", e => {
    if (general_settings.current_dim == 3) {
      arrow_settings.factor = e.target.value;
      plotCells(cells);
    }
  });

  var select_method = document.getElementById("select_method");

  select_method.addEventListener("change", e => {
    if (general_settings.current_dim == 3) {
      morse_graph_settings.selectMethod = e.target.value;
      plotCells(cells);
    }
  });

  var complex_line_width = document.getElementById("line_width");

  complex_line_width.addEventListener("change", e => {
    if (general_settings.current_dim == 3) {
      cell_complex_settings.lineWidth = parseFloat(e.target.value);
      cell_complex_settings.vertSize = parseFloat(e.target.value);
      plotCells(cells);
    }
  });
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////  Interactions  ///////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

d3.json(initial_file_name).then(d => {
  plot_param_graph(d);
  general_settings.current_file_data = d;
});

var file_selector = document.getElementById("myfile");

file_selector.addEventListener("change", e => {
  general_settings.has_eq_cells = false;

  var fr = new FileReader();
  fr.onload = function () {
    general_settings.user_file_data[0] = JSON.parse(fr.result);
    general_settings.current_file_data = general_settings.user_file_data[0];
    plot_param_graph(general_settings.user_file_data[0]);
  }

  fr.readAsText(e.target.files[0]);

  d3.select("#user").remove();

  d3.select("#fileSelect").append("option")
    .attr("value", "user")
    .attr("id", "user")
    .attr("selected", "selected")
    .html("User File");
});

var param_node = document.getElementById("param_node");

param_node.addEventListener("change", e => {
  document.getElementById("param_node_selected").innerHTML = "Parameter node: " + e.target.value;
});

var fileSelect = document.getElementById("fileSelect");

fileSelect.addEventListener("change", e => {
  general_settings.has_eq_cells = false;
  if (e.target.value == "user") {
    general_settings.current_file_data = general_settings.user_file_data[0];
    if (general_settings.user_file_data.length == 0) {
      alert("No file selected");
    }
    else {
      if (colormap_select.value == 1) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 2) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateSinebow,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 5) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateSpectral,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 6) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateTurbo,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 7) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateCool,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 8) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateWarm,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 9) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolatePlasma,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 10) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateCividis,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }

      plot_param_graph(general_settings.user_file_data[0]);
    }
  }
  else {
    d3.json(e.target.value).then(d => {
      general_settings.current_file_data = d;

      if (colormap_select.value == 1) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 2) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateSinebow,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 5) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateSpectral,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 6) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateTurbo,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 7) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateCool,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 8) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateWarm,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 9) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolatePlasma,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }
      else if (colormap_select.value == 10) {
        colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateCividis,
          general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
      }

      plot_param_graph(d);
    });
  }

});

var colormap_select = document.getElementById("colormap_select");

colormap_select.addEventListener("change", e => {
  if (e.target.value == 0) {
    colorMap = d3.scaleOrdinal(d3.schemeCategory10);
  }
  else if (e.target.value == 1) {
    colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow,
      general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
  }
  else if (e.target.value == 2) {
    colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateSinebow,
      general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
  }
  else if (e.target.value == 3) {
    colorMap = d3.scaleOrdinal(d3.schemePaired);
  }
  else if (e.target.value == 4) {
    colorMap = d3.scaleOrdinal(d3.schemeTableau10);
  }
  else if (e.target.value == 5) {
    colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateSpectral,
      general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
  }
  else if (e.target.value == 6) {
    colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateTurbo,
      general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
  }
  else if (e.target.value == 7) {
    colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateCool,
      general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
  }
  else if (e.target.value == 8) {
    colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateWarm,
      general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
  }
  else if (e.target.value == 9) {
    colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolatePlasma,
      general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
  }
  else {
    colorMap = d3.scaleOrdinal(d3.quantize(d3.interpolateCividis,
      general_settings.current_file_data.dynamics_database.find(db => db.parameter == general_settings.current_param).morse_graph.length + 1));
  }

  plot_param_graph(general_settings.current_file_data);
});
