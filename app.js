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

function mostrarEstado(mensaje) {
  $("estado").textContent = mensaje;
}

/* NÚMEROS: COMA PARA MILES, PUNTO PARA DECIMALES */
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

/* CÁLCULOS */
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

    // Redondeo a céntimos al terminar cada empresa.
    datos.importe =
      (datos.toneladas * datos.precio + 500n) / 1000n;

    // TOTAL = toneladas × precio + saldo − abonado de más.
    datos.total =
      datos.importe + datos.saldo - datos.excedente;

    return datos;
  });
}

function actualizar(guardar = true) {
  const datos = leerDatos();

  datos.forEach((empresa, indice) => {
    $(`${EMPRESAS[indice].id}-total`).textContent =
      empresa ? dinero(empresa.total) : "—";
  });

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
      "Completa los campos marcados para calcular y guardar."
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
    mostrarEstado(
      datos.some((empresa) => empresa.total < 0n)
        ? "Datos guardados. Un total negativo indica saldo a favor."
        : "Datos guardados."
    );
  }

  return datos;
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

  try {
    localStorage.setItem(
      CLAVE_GUARDADO,
      JSON.stringify(valores)
    );

    return true;
  } catch {
    mostrarEstado(
      "No se pudo guardar en este navegador. Descarga el Excel para conservar tus datos."
    );

    return false;
  }
}

function cargarDatos() {
  try {
    const guardado = localStorage.getItem(CLAVE_GUARDADO);

    if (!guardado) return "nuevo";

    const valores = JSON.parse(guardado);

    // Validar antes de aplicar los datos.
    EMPRESAS.forEach((empresa) => {
      CAMPOS.forEach((campo) => {
        const id = `${empresa.id}-${campo.id}`;

        if (typeof valores[id] !== "string") {
          throw new Error("Datos incompletos");
        }

        convertir(valores[id], campo.decimales);
      });
    });

    EMPRESAS.forEach((empresa) => {
      CAMPOS.forEach((campo) => {
        const id = `${empresa.id}-${campo.id}`;
        $(id).value = valores[id];
      });
    });

    return "recuperado";
  } catch {
    return "error";
  }
}

/* REEMPLAZAR EL VALOR AL TOCAR Y ESCRIBIR */
function prepararEntrada(entrada) {
  let seleccionPendiente = null;

  function cancelarSeleccion() {
    if (seleccionPendiente !== null) {
      cancelAnimationFrame(seleccionPendiente);
      seleccionPendiente = null;
    }
  }

  function seleccionar() {
    cancelarSeleccion();

    seleccionPendiente = requestAnimationFrame(() => {
      seleccionPendiente = null;

      if (document.activeElement === entrada) {
        entrada.select();
      }
    });
  }

  entrada.addEventListener("focus", seleccionar);
  entrada.addEventListener("click", seleccionar);

  entrada.addEventListener("input", () => {
    cancelarSeleccion();
    actualizar();
  });

  entrada.addEventListener("blur", () => {
    cancelarSeleccion();

    const decimales = Number(entrada.dataset.decimales);

    if (entrada.value.trim() === "") {
      entrada.value = decimales === 3 ? "0.000" : "0.00";
    }

    try {
      entrada.value = formatear(
        convertir(entrada.value, decimales),
        decimales
      );
    } catch {
      // Mantener el texto para que el usuario pueda corregirlo.
    }

    actualizar();
  });
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

/* LIMPIAR */
function limpiarDatos() {
  if (!window.confirm(
    "¿Limpiar todos los datos? El precio volverá a 8.97."
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

  actualizar();
  $("larama-toneladas").focus();
}

/* EXCEL CON CUADROS, COLORES Y BORDES */
async function exportarExcel() {
  const datos = validarAccion();

  if (!datos) return;

  if (!window.ExcelJS) {
    mostrarEstado(
      "Conéctate a internet y recarga la página para descargar Excel."
    );
    return;
  }

  // Evitar pérdida de precisión con cantidades excesivas.
  const limite = 999999999999999n;
  const fueraDeRango = (valor) =>
    valor > limite || valor < -limite;

  const campos = [
    "toneladas", "precio", "importe",
    "saldo", "excedente", "total"
  ];

  if (
    datos.some((empresa) =>
      campos.some((campo) => fueraDeRango(empresa[campo]))
    ) ||
    ["toneladas", "importe", "saldo", "excedente", "total"]
      .some((campo) => fueraDeRango(sumar(datos, campo)))
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
    const libro = new ExcelJS.Workbook();

    libro.creator = "Agrícola Los Médanos";
    libro.created = new Date();

    const hoja = libro.addWorksheet("Control de descarte", {
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
          top: 0.4,
          bottom: 0.4,
          header: 0.15,
          footer: 0.15
        }
      }
    });

    const colores = {
      verde: "FF286440",
      verdeClaro: "FFE6F0E4",
      amarillo: "FFFFFF00",
      rojo: "FFBD2028",
      gris: "FFF2F5F2",
      borde: "FFBAC8BC",
      blanco: "FFFFFFFF",
      texto: "FF202820"
    };

    const borde = {
      top: {
        style: "thin",
        color: { argb: colores.borde }
      },
      bottom: {
        style: "thin",
        color: { argb: colores.borde }
      },
      left: {
        style: "thin",
        color: { argb: colores.borde }
      },
      right: {
        style: "thin",
        color: { argb: colores.borde }
      }
    };

    const numero = (valor, decimales) =>
      Number(decimalExacto(valor, decimales));

    const formatoDinero =
      '"S/ " #,##0.00;[Red]"S/ " -#,##0.00';

    hoja.columns = [
      { width: 27 },
      { width: 25 },
      { width: 4 },
      { width: 27 },
      { width: 25 },
      { width: 4 },
      { width: 27 },
      { width: 25 }
    ];

    function combinar(rango, texto, opciones = {}) {
      hoja.mergeCells(rango);

      const celda = hoja.getCell(rango.split(":")[0]);

      celda.value = texto;

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

    combinar(
      "A4:H4",
      `Generado: ${fecha} · Hora de Perú`,
      {
        font: { size: 10 },
        alignment: { horizontal: "right" }
      }
    );

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
          alignment: { horizontal: "center" }
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
        const nombre = hoja.getCell(`${etiqueta}${fila}`);
        const importe = hoja.getCell(`${valor}${fila}`);

        nombre.value = titulo;
        importe.value = contenido;

        [nombre, importe].forEach((celda) => {
          celda.font = {
            name: "Calibri",
            size: 12,
            color: { argb: colores.texto }
          };

          celda.border = borde;

          celda.alignment = {
            vertical: "middle",
            horizontal: "left",
            wrapText: true
          };
        });

        if (fila >= 9) {
          importe.alignment = {
            vertical: "middle",
            horizontal: "right"
          };

          importe.numFmt =
            fila === 9 ? "#,##0.000" : formatoDinero;
        }

        if (fila === 9) {
          importe.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFB5E3A0" }
          };
        }

        if (fila === 13) {
          [nombre, importe].forEach((celda) => {
            celda.font = {
              name: "Calibri",
              size: 12,
              color: { argb: colores.rojo }
            };
          });
        }

        if (fila === 14) {
          [nombre, importe].forEach((celda) => {
            celda.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: colores.verdeClaro }
            };

            celda.font = {
              name: "Calibri",
              size: 13,
              bold: true,
              color: { argb: colores.verde }
            };
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
      hoja.getRow(fila).height = fila === 7 ? 44 : 34;
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
      {
        fila: 18,
        titulo: "TOTAL TONELADAS",
        campo: "toneladas",
        origen: 9,
        formato: '#,##0.000" t"',
        decimales: 3
      },
      {
        fila: 19,
        titulo: "SALDOS SUMADOS",
        campo: "saldo",
        origen: 12,
        formato: formatoDinero,
        decimales: 2
      },
      {
        fila: 20,
        titulo: "ABONADO DE MÁS DESCONTADO",
        campo: "excedente",
        origen: 13,
        formato: formatoDinero,
        decimales: 2
      },
      {
        fila: 21,
        titulo: "TOTAL GENERAL A PAGAR",
        campo: "total",
        origen: 14,
        formato: formatoDinero,
        decimales: 2
      }
    ];

    resumen.forEach((item) => {
      const nombre = combinar(
        `A${item.fila}:E${item.fila}`,
        item.titulo,
        {
          fondo: colores.gris,
          font: { bold: true }
        }
      );

      const resultado = combinar(
        `F${item.fila}:H${item.fila}`,
        "",
        {
          fondo: colores.verdeClaro,
          font: { size: 14, bold: true },
          alignment: { horizontal: "right" }
        }
      );

      resultado.value = {
        formula:
          `SUM(B${item.origen},E${item.origen},H${item.origen})`,
        result: numero(
          sumar(datos, item.campo),
          item.decimales
        )
      };

      resultado.numFmt = item.formato;

      nombre.border = borde;
      resultado.border = borde;

      hoja.getRow(item.fila).height = 32;
    });

    combinar(
      "A23:H23",
      "TOTAL = toneladas × precio + saldo pendiente − abonado de más.",
      { font: { size: 11 } }
    );

    combinar(
      "A24:H24",
      "Un total negativo representa saldo a favor.",
      { font: { size: 10 } }
    );

    hoja.getRow(23).height = 24;
    hoja.getRow(24).height = 22;

    hoja.pageSetup.printArea = "A1:H24";

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

    mostrarEstado("Excel generado con cuadros y formato.");
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

    const canvas = await window.html2canvas($("reporte"), {
      backgroundColor: "#ffffff",
      scale: 2,
      windowWidth: 1400,

      onclone: (documento) => {
        const reporte = documento.getElementById("reporte");

        reporte.classList.add("modo-exportacion");

        reporte.querySelectorAll("input").forEach((entrada) => {
          const decimales = Number(
            entrada.dataset.decimales
          );

          const texto = documento.createElement("span");

          texto.className = "valor-exportado";
          texto.textContent = formatear(
            convertir(entrada.value, decimales),
            decimales
          );

          entrada.replaceWith(texto);
        });
      }
    });

    const archivo = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("No se pudo crear la imagen"));
        }
      }, "image/png");
    });

    url = URL.createObjectURL(archivo);

    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = "Control-de-descarte.png";

    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    mostrarEstado("Imagen PNG generada.");
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

  $("btn-png").addEventListener("click", exportarPNG);
  $("btn-excel").addEventListener("click", exportarExcel);
  $("btn-limpiar").addEventListener("click", limpiarDatos);

  if (carga === "recuperado") {
    mostrarEstado("Tus datos guardados están listos.");
  } else if (carga === "error") {
    mostrarEstado(
      "No se pudieron recuperar los datos. Ingresa los valores nuevamente."
    );
  } else {
    mostrarEstado(
      "Toca un campo y escribe. El precio inicial es 8.97."
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}