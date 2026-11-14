"use strict";

/* CONFIGURACIÓN */
const CLAVE_GUARDADO = "control-descarte-v4";

const EMPRESAS = [
  { id: "larama", nombre: "Larama" },
  { id: "aga", nombre: "Aga" },
  { id: "arenuva", nombre: "Arenuva" }
];

const CAMPOS = [
  { id: "toneladas", decimales: 3, inicial: "0.000" },
  { id: "precio", decimales: 2, inicial: "8.97" },
  { id: "saldo", decimales: 2, inicial: "0.00" },
  { id: "excedente", decimales: 2, inicial: "0.00" }
];

const $ = (id) => document.getElementById(id);

/* Total original del mensaje, con tres decimales. */
let totalMensaje = null;

function mostrarEstado(texto) {
  $("estado").textContent = texto;
}

/* NÚMEROS EXACTOS */
function convertir(valor, decimales) {
  const texto = String(valor).trim();

  const patron = new RegExp(
    `^(?:\\d+|\\d{1,3}(?:,\\d{3})+)(?:\\.\\d{1,${decimales}})?$`
  );

  if (!patron.test(texto)) {
    throw new Error("Número incorrecto");
  }

  const [entero, fraccion = ""] = texto
    .replaceAll(",", "")
    .split(".");

  if (BigInt(entero) > 999999999n) {
    throw new Error("Cantidad demasiado grande");
  }

  return (
    BigInt(entero) * 10n ** BigInt(decimales) +
    BigInt(fraccion.padEnd(decimales, "0"))
  );
}

function decimalExacto(valor, decimales) {
  const negativo = valor < 0n;
  const absoluto = negativo ? -valor : valor;

  const texto = absoluto
    .toString()
    .padStart(decimales + 1, "0");

  return (
    (negativo ? "-" : "") +
    texto.slice(0, -decimales) +
    "." +
    texto.slice(-decimales)
  );
}

function formatear(valor, decimales) {
  const [entero, fraccion] = decimalExacto(
    valor,
    decimales
  ).split(".");

  return (
    entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    "." +
    fraccion
  );
}

function dinero(valor) {
  return `S/ ${formatear(valor, 2)}`;
}

function sumar(datos, campo) {
  return datos.reduce(
    (total, empresa) => total + empresa[campo],
    0n
  );
}

/* LEER LAS TABLAS */
function leerDatos() {
  return EMPRESAS.map((empresa) => {
    const datos = { ...empresa };
    let valido = true;

    CAMPOS.forEach((campo) => {
      const entrada = $(`${empresa.id}-${campo.id}`);

      try {
        datos[campo.id] = convertir(
          entrada.value,
          campo.decimales
        );

        entrada.setCustomValidity("");
        entrada.removeAttribute("aria-invalid");
      } catch {
        entrada.setCustomValidity(
          `Escribe un número desde cero con hasta ${campo.decimales} decimales. Usa coma para miles y punto para decimales.`
        );

        entrada.setAttribute("aria-invalid", "true");
        valido = false;
      }
    });

    if (!valido) return null;

    // Toneladas × precio, redondeado a céntimos.
    datos.importe =
      (datos.toneladas * datos.precio + 500n) / 1000n;

    datos.total =
      datos.importe + datos.saldo - datos.excedente;

    return datos;
  });
}

/* COMPROBAR EL DESCARTE TOTAL */
function comprobarTotal() {
  let suma = 0n;
  let valido = true;

  EMPRESAS.forEach((empresa) => {
    try {
      suma += convertir(
        $(`${empresa.id}-toneladas`).value,
        3
      );
    } catch {
      valido = false;
    }
  });

  const panel = $("comprobacion");
  const resultado = $("resultado-comprobacion");

  $("descarte-total-mensaje").textContent =
    totalMensaje === null
      ? "—"
      : `${formatear(totalMensaje, 3)} t`;

  $("descarte-total-calculado").textContent =
    valido ? `${formatear(suma, 3)} t` : "—";

  if (!valido) {
    panel.dataset.estado = "error";
    $("descarte-diferencia").textContent = "—";
    resultado.textContent =
      "Revisa las toneladas para comprobar el total.";

    return {
      estado: "error",
      texto: resultado.textContent,
      suma: null,
      diferencia: null
    };
  }

  if (totalMensaje === null) {
    panel.dataset.estado = "pendiente";
    $("descarte-diferencia").textContent = "—";
    resultado.textContent =
      "Pega el mensaje y pulsa “Completar y comprobar”.";

    return {
      estado: "pendiente",
      texto: "Sin descarte total de referencia.",
      suma,
      diferencia: null
    };
  }

  const diferencia = suma - totalMensaje;

  $("descarte-diferencia").textContent =
    `${formatear(diferencia, 3)} t`;

  if (diferencia === 0n) {
    panel.dataset.estado = "correcto";
    resultado.textContent =
      "CORRECTO: la suma coincide con el descarte total.";
  } else {
    panel.dataset.estado = "error";
    resultado.textContent =
      "NO COINCIDE: revisa las cantidades. " +
      "La diferencia es la suma de las empresas menos el total del mensaje.";
  }

  return {
    estado: diferencia === 0n ? "correcto" : "error",
    texto: resultado.textContent,
    suma,
    diferencia
  };
}

/* ACTUALIZAR RESULTADOS */
function actualizar(guardar = true) {
  const datos = leerDatos();

  datos.forEach((empresa, indice) => {
    $(`${EMPRESAS[indice].id}-total`).textContent =
      empresa ? dinero(empresa.total) : "—";
  });

  const comprobacion = comprobarTotal();

  if (datos.some((empresa) => empresa === null)) {
    [
      "total-toneladas",
      "total-general",
      "total-saldos",
      "total-excedentes"
    ].forEach((id) => {
      $(id).textContent = "—";
    });

    mostrarEstado(
      "Revisa los campos marcados. Los cambios incompletos no se guardan."
    );

    return null;
  }

  $("total-toneladas").textContent =
    `${formatear(sumar(datos, "toneladas"), 3)} t`;

  $("total-general").textContent =
    dinero(sumar(datos, "total"));

  $("total-saldos").textContent =
    dinero(sumar(datos, "saldo"));

  $("total-excedentes").textContent =
    dinero(sumar(datos, "excedente"));

  if (guardar && guardarDatos()) {
    let mensaje = "Datos guardados.";

    if (comprobacion.estado === "error") {
      mensaje += " Atención: el descarte total no coincide.";
    }

    if (datos.some((empresa) => empresa.total < 0n)) {
      mensaje += " Un total negativo indica saldo a favor.";
    }

    mostrarEstado(mensaje);
  }

  return datos;
}

/* PEGAR MENSAJE Y RECONOCER TOTALES */
function importarMensaje() {
  const original = $("mensaje-stock").value.trim();

  if (!original) {
    mostrarEstado("Primero pega el mensaje completo.");
    $("mensaje-stock").focus();
    return;
  }

  /*
   * Quitar formato habitual de WhatsApp.
   * Las líneas de campo, packing y otros datos se ignoran.
   */
  const texto = original
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[*_`]/g, "")
    .replace(/\\[ \t]*(?=\n|$)/g, "");

  function extraerCantidad(linea, nombre) {
    const coincidencia = linea.trim().match(
      /^([0-9][0-9,.]*)(?=\s|$)/
    );

    if (!coincidencia) {
      throw new Error(
        `${nombre}: no se pudo leer la cantidad.`
      );
    }

    try {
      return convertir(coincidencia[1], 3);
    } catch {
      throw new Error(
        `${nombre}: revisa el número. Usa coma para miles y punto para decimales, con hasta tres decimales.`
      );
    }
  }

  try {
    const generales = [
      ...texto.matchAll(
        /^[ \t]*DESCARTE[ \t]+TOTAL[ \t]*:[ \t]*([^\n]*)$/gim
      )
    ];

    if (generales.length !== 1) {
      throw new Error(
        "El mensaje debe incluir una sola línea DESCARTE TOTAL: con su cantidad."
      );
    }

    const esperado = extraerCantidad(
      generales[0][1],
      "DESCARTE TOTAL"
    );

    const encabezados = [
      ...texto.matchAll(
        /^[ \t]*(LARAMA|AGA|ARENUVA)[ \t]*:[ \t]*/gim
      )
    ];

    const cantidades = new Map();

    encabezados.forEach((encabezado, indice) => {
      const id = encabezado[1].toLowerCase();

      const empresa = EMPRESAS.find(
        (item) => item.id === id
      );

      if (cantidades.has(id)) {
        throw new Error(
          `${empresa.nombre} aparece más de una vez.`
        );
      }

      const inicio =
        encabezado.index + encabezado[0].length;

      const fin =
        encabezados[indice + 1]?.index ?? texto.length;

      const bloque = texto.slice(inicio, fin);

      /*
       * Solo reconoce una línea que empiece con TOTAL:.
       * No suma las líneas CAMPO, PACKING u otras.
       */
      const totales = [
        ...bloque.matchAll(
          /^[ \t]*TOTAL[ \t]*:[ \t]*([^\n]*)$/gim
        )
      ];

      if (totales.length !== 1) {
        throw new Error(
          `${empresa.nombre} debe tener una sola línea TOTAL: con su cantidad.`
        );
      }

      cantidades.set(
        id,
        extraerCantidad(totales[0][1], empresa.nombre)
      );
    });

    const faltantes = EMPRESAS.filter(
      (empresa) => !cantidades.has(empresa.id)
    );

    if (faltantes.length) {
      throw new Error(
        "Falta el total de: " +
        faltantes.map((empresa) => empresa.nombre).join(", ") +
        "."
      );
    }

    /*
     * Aplicar únicamente después de validar el mensaje completo.
     * Precio, saldo y abonado de más no se reemplazan.
     */
    cantidades.forEach((cantidad, id) => {
      const entrada = $(`${id}-toneladas`);

      entrada.value = formatear(cantidad, 3);
      entrada.setCustomValidity("");
      entrada.removeAttribute("aria-invalid");
    });

    totalMensaje = esperado;

    const datos = actualizar(true);
    const comprobacion = comprobarTotal();

    let aviso =
      comprobacion.estado === "correcto"
        ? "Totales completados. El descarte total coincide."
        : "Totales completados, pero el descarte total NO coincide. Revisa la diferencia.";

    aviso += " Las cantidades se copiaron sin convertir unidades.";

    if (!datos) {
      aviso += " Corrige los otros campos para guardar.";
    }

    mostrarEstado(aviso);
  } catch (error) {
    mostrarEstado(
      error.message + " No se modificaron las tablas."
    );
  }
}

/* GUARDADO LOCAL */
function guardarDatos() {
  const valores = {};

  EMPRESAS.forEach((empresa) => {
    CAMPOS.forEach((campo) => {
      const id = `${empresa.id}-${campo.id}`;
      valores[id] = $(id).value;
    });
  });

  const guardado = {
    version: 2,
    valores,
    mensaje: $("mensaje-stock").value,
    totalMensaje:
      totalMensaje === null
        ? null
        : decimalExacto(totalMensaje, 3)
  };

  try {
    localStorage.setItem(
      CLAVE_GUARDADO,
      JSON.stringify(guardado)
    );

    return true;
  } catch {
    mostrarEstado(
      "No se pudo guardar en este navegador. Descarga el Excel para conservar los datos."
    );

    return false;
  }
}

function cargarDatos() {
  try {
    const texto = localStorage.getItem(CLAVE_GUARDADO);

    if (!texto) return "nuevo";

    const guardado = JSON.parse(texto);

    // Compatible con el guardado de la versión anterior.
    const nuevoFormato = guardado.version === 2;
    const valores = nuevoFormato
      ? guardado.valores
      : guardado;

    EMPRESAS.forEach((empresa) => {
      CAMPOS.forEach((campo) => {
        const id = `${empresa.id}-${campo.id}`;

        if (typeof valores?.[id] !== "string") {
          throw new Error("Datos incompletos");
        }

        convertir(valores[id], campo.decimales);
      });
    });

    let referencia = null;

    if (
      nuevoFormato &&
      guardado.totalMensaje !== null
    ) {
      referencia = convertir(
        guardado.totalMensaje,
        3
      );
    }

    EMPRESAS.forEach((empresa) => {
      CAMPOS.forEach((campo) => {
        const id = `${empresa.id}-${campo.id}`;
        $(id).value = valores[id];
      });
    });

    totalMensaje = referencia;

    if (nuevoFormato && typeof guardado.mensaje === "string") {
      $("mensaje-stock").value = guardado.mensaje;
    }

    return "recuperado";
  } catch {
    return "error";
  }
}

/* SELECCIONAR EL VALOR AL TOCAR EL CAMPO */
function prepararEntrada(entrada) {
  let pendiente = null;

  function cancelar() {
    if (pendiente !== null) {
      cancelAnimationFrame(pendiente);
      pendiente = null;
    }
  }

  function seleccionar() {
    cancelar();

    pendiente = requestAnimationFrame(() => {
      pendiente = null;

      if (document.activeElement === entrada) {
        entrada.select();
      }
    });
  }

  entrada.addEventListener("focus", seleccionar);
  entrada.addEventListener("click", seleccionar);

  entrada.addEventListener("input", () => {
    cancelar();
    actualizar();
  });

  entrada.addEventListener("blur", () => {
    cancelar();

    const decimales = Number(
      entrada.dataset.decimales
    );

    if (!entrada.value.trim()) {
      entrada.value =
        decimales === 3 ? "0.000" : "0.00";
    }

    try {
      entrada.value = formatear(
        convertir(entrada.value, decimales),
        decimales
      );
    } catch {
      // Conservar el texto para que pueda corregirse.
    }

    actualizar();
  });
}

/* LIMPIAR */
function limpiarDatos() {
  if (!confirm(
    "¿Limpiar el mensaje y todos los datos? El precio volverá a 8.97."
  )) {
    return;
  }

  EMPRESAS.forEach((empresa) => {
    CAMPOS.forEach((campo) => {
      const entrada = $(`${empresa.id}-${campo.id}`);

      entrada.value = campo.inicial;
      entrada.setCustomValidity("");
      entrada.removeAttribute("aria-invalid");
    });
  });

  $("mensaje-stock").value = "";
  totalMensaje = null;

  actualizar();
  $("mensaje-stock").focus();
}

function validarAccion() {
  const datos = actualizar(false);

  if (!datos) {
    const entrada = document.querySelector(
      '#empresas input[aria-invalid="true"]'
    );

    if (entrada) {
      entrada.focus();
      entrada.reportValidity();
    }
  }

  return datos;
}

/* EXCEL PROFESIONAL */
async function exportarExcel() {
  const datos = validarAccion();

  if (!datos) return;

  if (!window.ExcelJS) {
    mostrarEstado(
      "Conéctate a internet y recarga la página para descargar Excel."
    );
    return;
  }

  const limite = 999999999999999n;
  const excede = (valor) =>
    valor > limite || valor < -limite;

  const campos = [
    "toneladas", "precio", "importe",
    "saldo", "excedente", "total"
  ];

  if (
    datos.some((empresa) =>
      campos.some((campo) => excede(empresa[campo]))
    ) ||
    campos.some((campo) => excede(sumar(datos, campo)))
  ) {
    mostrarEstado(
      "Las cantidades son demasiado grandes para exportarlas con precisión."
    );
    return;
  }

  const boton = $("btn-excel");
  boton.disabled = true;
  mostrarEstado("Preparando Excel…");

  let url;

  try {
    const comprobacion = comprobarTotal();
    const libro = new ExcelJS.Workbook();

    libro.creator = "Agrícola Los Médanos";
    libro.created = new Date();

    const hoja = libro.addWorksheet(
      "Control de descarte",
      {
        views: [{ showGridLines: false }],
        pageSetup: {
          paperSize: 9,
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 1,
          horizontalCentered: true,
          margins: {
            left: 0.25,
            right: 0.25,
            top: 0.35,
            bottom: 0.35,
            header: 0.15,
            footer: 0.15
          }
        }
      }
    );

    const colores = {
      verde: "FF286440",
      claro: "FFE6F0E4",
      amarillo: "FFFFFF00",
      rojo: "FFBD2028",
      error: "FFFFE9E9",
      gris: "FFF2F5F2",
      borde: "FFBAC8BC",
      blanco: "FFFFFFFF",
      texto: "FF202820"
    };

    const borde = {};

    ["top", "bottom", "left", "right"].forEach((lado) => {
      borde[lado] = {
        style: "thin",
        color: { argb: colores.borde }
      };
    });

    const numero = (valor, decimales) =>
      Number(decimalExacto(valor, decimales));

    const formatoDinero =
      '"S/ " #,##0.00;[Red]"S/ " -#,##0.00';

    hoja.columns = [
      { width: 27 }, { width: 25 }, { width: 4 },
      { width: 27 }, { width: 25 }, { width: 4 },
      { width: 27 }, { width: 25 }
    ];

    function estilo(celda, opciones = {}) {
      celda.font = {
        name: "Calibri",
        size: 12,
        color: { argb: colores.texto },
        ...opciones.font
      };

      celda.alignment = {
        vertical: "middle",
        horizontal: "left",
        wrapText: true,
        ...opciones.alignment
      };

      if (opciones.fondo) {
        celda.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: opciones.fondo }
        };
      }

      if (opciones.borde) celda.border = borde;
    }

    function combinar(rango, valor, opciones = {}) {
      hoja.mergeCells(rango);

      const celda = hoja.getCell(
        rango.split(":")[0]
      );

      celda.value = valor;
      estilo(celda, opciones);

      return celda;
    }

    combinar("A1:H2", "AGRÍCOLA LOS MÉDANOS", {
      fondo: colores.verde,
      font: {
        size: 22,
        bold: true,
        color: { argb: colores.blanco }
      },
      alignment: { horizontal: "center" }
    });

    hoja.getRow(1).height = 25;
    hoja.getRow(2).height = 20;

    combinar(
      "A3:H3",
      "CONTROL DE DESCARTE DE ARÁNDANOS · TONELADAS",
      {
        font: { size: 13, bold: true },
        alignment: { horizontal: "center" }
      }
    );

    hoja.getRow(3).height = 26;

    const fecha = new Date().toLocaleString("es-PE", {
      timeZone: "America/Lima",
      dateStyle: "short",
      timeStyle: "short"
    });

    combinar("A4:H4", `Generado: ${fecha} · Perú`, {
      font: { size: 10 },
      alignment: { horizontal: "right" }
    });

    const bloques = [
      { etiqueta: "A", valor: "B" },
      { etiqueta: "D", valor: "E" },
      { etiqueta: "G", valor: "H" }
    ];

    datos.forEach((empresa, indice) => {
      const { etiqueta, valor } = bloques[indice];

      combinar(
        `${etiqueta}6:${valor}6`,
        empresa.nombre.toUpperCase(),
        {
          fondo: colores.amarillo,
          font: { size: 16, bold: true },
          alignment: { horizontal: "center" },
          borde: true
        }
      );

      const filas = [
        [7, "CLIENTE", "Agrícola Los Médanos"],
        [8, "DESCARTE", "Arándanos"],
        [9, "TONELADAS", numero(empresa.toneladas, 3)],
        [10, "PRECIO POR TONELADA", numero(empresa.precio, 2)],
        [11, "IMPORTE", null],
        [12, "SALDO A SUMAR", numero(empresa.saldo, 2)],
        [13, "ABONARON DE MÁS", numero(empresa.excedente, 2)],
        [14, "TOTAL A PAGAR", null]
      ];

      filas.forEach(([fila, titulo, contenido]) => {
        const nombre = hoja.getCell(
          `${etiqueta}${fila}`
        );

        const cantidad = hoja.getCell(
          `${valor}${fila}`
        );

        nombre.value = titulo;
        cantidad.value = contenido;

        estilo(nombre, { borde: true });
        estilo(cantidad, { borde: true });

        if (fila >= 9) {
          cantidad.alignment = {
            vertical: "middle",
            horizontal: "right"
          };

          cantidad.numFmt =
            fila === 9 ? "#,##0.000" : formatoDinero;
        }

        if (fila === 9) {
          cantidad.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFB5E3A0" }
          };
        }

        if (fila === 13) {
          [nombre, cantidad].forEach((celda) => {
            celda.font = {
              name: "Calibri",
              size: 12,
              color: { argb: colores.rojo }
            };
          });
        }

        if (fila === 14) {
          [nombre, cantidad].forEach((celda) => {
            estilo(celda, {
              borde: true,
              fondo: colores.claro,
              font: {
                size: 13,
                bold: true,
                color: { argb: colores.verde }
              },
              alignment: {
                horizontal:
                  celda === cantidad ? "right" : "left"
              }
            });
          });
        }
      });

      hoja.getCell(`${valor}11`).value = {
        formula: `ROUND(${valor}9*${valor}10,2)`,
        result: numero(empresa.importe, 2)
      };

      hoja.getCell(`${valor}14`).value = {
        formula: `ROUND(${valor}11+${valor}12-${valor}13,2)`,
        result: numero(empresa.total, 2)
      };
    });

    for (let fila = 6; fila <= 14; fila++) {
      hoja.getRow(fila).height =
        fila === 7 ? 44 : 34;
    }

    combinar("A17:H17", "RESUMEN GENERAL", {
      fondo: colores.verde,
      font: {
        size: 14,
        bold: true,
        color: { argb: colores.blanco }
      }
    });

    hoja.getRow(17).height = 30;

    const resumen = [
      [18, "TOTAL TONELADAS", "toneladas", 9, 3],
      [19, "SALDOS SUMADOS", "saldo", 12, 2],
      [20, "ABONADO DE MÁS DESCONTADO", "excedente", 13, 2],
      [21, "TOTAL GENERAL A PAGAR", "total", 14, 2]
    ];

    resumen.forEach(
      ([fila, titulo, campo, origen, decimales]) => {
        combinar(`A${fila}:E${fila}`, titulo, {
          fondo: colores.gris,
          font: { bold: true },
          borde: true
        });

        const resultado = combinar(
          `F${fila}:H${fila}`,
          {
            formula: `SUM(B${origen},E${origen},H${origen})`,
            result: numero(sumar(datos, campo), decimales)
          },
          {
            fondo: colores.claro,
            font: { size: 14, bold: true },
            alignment: { horizontal: "right" },
            borde: true
          }
        );

        resultado.numFmt =
          decimales === 3
            ? '#,##0.000" t"'
            : formatoDinero;

        hoja.getRow(fila).height = 32;
      }
    );

    combinar(
      "A23:H23",
      "COMPROBACIÓN DEL DESCARTE TOTAL",
      {
        fondo: colores.verde,
        font: {
          bold: true,
          color: { argb: colores.blanco }
        }
      }
    );

    hoja.getRow(23).height = 28;

    combinar(
      "A24:E24",
      "DESCARTE TOTAL DEL MENSAJE",
      { borde: true }
    );

    const referencia = combinar(
      "F24:H24",
      totalMensaje === null
        ? "Sin referencia"
        : numero(totalMensaje, 3),
      {
        borde: true,
        alignment: { horizontal: "right" }
      }
    );

    referencia.numFmt = '#,##0.000" t"';

    combinar("A25:E25", "SUMA DE LAS EMPRESAS", {
      borde: true
    });

    const sumaExcel = combinar(
      "F25:H25",
      {
        formula: "SUM(B9,E9,H9)",
        result: numero(sumar(datos, "toneladas"), 3)
      },
      {
        borde: true,
        alignment: { horizontal: "right" }
      }
    );

    sumaExcel.numFmt = '#,##0.000" t"';

    combinar("A26:E26", "DIFERENCIA", {
      borde: true
    });

    const diferenciaExcel = combinar(
      "F26:H26",
      totalMensaje === null
        ? "—"
        : {
            formula: "ROUND(F25-F24,3)",
            result: numero(comprobacion.diferencia, 3)
          },
      {
        borde: true,
        alignment: { horizontal: "right" }
      }
    );

    diferenciaExcel.numFmt =
      '#,##0.000" t";[Red]-#,##0.000" t"';

    combinar("A27:H27", comprobacion.texto, {
      fondo:
        comprobacion.estado === "correcto"
          ? colores.claro
          : comprobacion.estado === "error"
            ? colores.error
            : colores.gris,
      font: { bold: true }
    });

    for (let fila = 24; fila <= 26; fila++) {
      hoja.getRow(fila).height = 28;
    }

    hoja.getRow(27).height = 36;

    combinar(
      "A29:H29",
      "TOTAL = toneladas × precio + saldo pendiente − abonado de más.",
      { font: { size: 11 } }
    );

    combinar(
      "A30:H30",
      "Cantidades copiadas sin convertir unidades. Un total negativo representa saldo a favor.",
      { font: { size: 10 } }
    );

    hoja.getRow(29).height = 24;
    hoja.getRow(30).height = 24;

    hoja.pageSetup.printArea = "A1:H30";
    hoja.headerFooter.oddFooter =
      "&LControl de descarte&RPágina &P de &N";

    libro.calcProperties.fullCalcOnLoad = true;

    const contenido = await libro.xlsx.writeBuffer();

    const archivo = new Blob([contenido], {
      type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    url = URL.createObjectURL(archivo);

    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = "Control-de-descarte.xlsx";

    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    mostrarEstado(
      comprobacion.estado === "error"
        ? "Excel generado. Incluye la advertencia de que el total no coincide."
        : "Excel generado con cuadros y comprobación."
    );
  } catch {
    mostrarEstado(
      "No se pudo generar el Excel. Intenta nuevamente."
    );
  } finally {
    if (url) {
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    boton.disabled = false;
  }
}

/* IMAGEN PNG */
async function exportarPNG() {
  if (!validarAccion()) return;

  if (!window.html2canvas) {
    mostrarEstado(
      "Conéctate a internet y recarga la página para guardar la imagen."
    );
    return;
  }

  const boton = $("btn-png");
  boton.disabled = true;
  mostrarEstado("Preparando imagen…");

  let url;

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const canvas = await window.html2canvas(
      $("reporte"),
      {
        backgroundColor: "#ffffff",
        scale: 2,
        windowWidth: 1400,

        onclone: (documento) => {
          const reporte =
            documento.getElementById("reporte");

          reporte.classList.add("modo-exportacion");

          reporte.querySelectorAll("input").forEach(
            (entrada) => {
              const decimales = Number(
                entrada.dataset.decimales
              );

              const texto =
                documento.createElement("span");

              texto.className = "valor-exportado";
              texto.textContent = formatear(
                convertir(entrada.value, decimales),
                decimales
              );

              entrada.replaceWith(texto);
            }
          );
        }
      }
    );

    const archivo = await new Promise(
      (resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("No se pudo crear la imagen"));
          }
        }, "image/png");
      }
    );

    url = URL.createObjectURL(archivo);

    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = "Control-de-descarte.png";

    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    mostrarEstado(
      comprobarTotal().estado === "error"
        ? "Imagen generada. El descarte total no coincide; revisa la advertencia."
        : "Imagen PNG generada."
    );
  } catch {
    mostrarEstado(
      "No se pudo generar la imagen. Intenta nuevamente."
    );
  } finally {
    if (url) {
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    boton.disabled = false;
  }
}

/* INICIO */
function iniciar() {
  const carga = cargarDatos();

  actualizar(false);

  document.querySelectorAll("#empresas input").forEach(
    prepararEntrada
  );

  $("btn-importar").addEventListener(
    "click",
    importarMensaje
  );

  $("btn-png").addEventListener(
    "click",
    exportarPNG
  );

  $("btn-excel").addEventListener(
    "click",
    exportarExcel
  );

  $("btn-limpiar").addEventListener(
    "click",
    limpiarDatos
  );

  if (carga === "recuperado") {
    mostrarEstado(
      "Tus datos guardados están listos. Revisa la comprobación del total."
    );
  } else if (carga === "error") {
    mostrarEstado(
      "No se pudieron recuperar los datos. Pega el mensaje para comenzar."
    );
  } else {
    mostrarEstado(
      "Pega el mensaje y pulsa “Completar y comprobar”."
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    iniciar
  );
} else {
  iniciar();
}
