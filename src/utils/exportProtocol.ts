import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * 🛰️ EXPORT PROTOCOL (V2 - Strict Type Safe)
 * Converts the Janus Forge Synthesis Stage into a high-authority PDF report.
 */
export const exportToPDF = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error("Protocol Error: Synthesis Stage element not found.");
    return;
  }

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#050505',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // Calculate dimensions to fit A4 page width
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error("PDF Export Protocol Failed:", error);
  }
};
