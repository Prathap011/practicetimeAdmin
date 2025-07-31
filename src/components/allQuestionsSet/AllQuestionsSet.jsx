import React, { useEffect, useState, useRef } from "react";
import { database, auth } from "../firebase/FirebaseSetup";
import { ref, get, set, remove } from "firebase/database";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./AllQuestionsSet.css";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import parse from "html-react-parser";
import practiceTime from "../../assets/practiceTime.jpg";
import JsBarcode from "jsbarcode";
import JoditEditor from "jodit-react";
/**
 * Generates a barcode image (as a data URL) from the given text.
 *
 * @param {string} text - The text to encode in the barcode.
 * @returns {string} - The generated barcode as a data URL.
 */
const generateBarcodeDataUrl = (text) => {
  const canvas = document.createElement("canvas");

  JsBarcode(canvas, text, {
    format: "CODE128",       // Common barcode format
    displayValue: false,     // Hide text below the barcode
    width: 1,                // Bar width
    height: 20,              // Bar height
    margin: 0,               // No margin
    background: "#ffffff",   // Optional: white background for better contrast
    lineColor: "#000000",    // Black bars
  });

  return canvas.toDataURL("image/png");
};
const AllQuestionsSet = () => {
  const [questionSets, setQuestionSets] = useState([]);
  const [filteredSets, setFilteredSets] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSet, setSelectedSet] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [editingIndex, setEditingIndex] = useState(null);
  const [editedQuestionText, setEditedQuestionText] = useState("");
  const editor = useRef(null);




  const [editingQuestionIndex, setEditingQuestionIndex] = React.useState(null);
  const [editingQuestion, setEditingQuestion] = React.useState(null);

  const [userEmail, setUserEmail] = useState("");
  const [attachLoading, setAttachLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const pdfContentRef = useRef(null);

  const formatEmail = (username) => {
    if (username.includes("@")) return username;
    return `${username}@gmail.com`;
  };

  useEffect(() => {
    fetchQuestionSets();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredSets(questionSets);
    } else {
      const lowercasedTerm = searchTerm.toLowerCase();
      const filtered = questionSets.filter(([setName]) =>
        setName.toLowerCase().includes(lowercasedTerm)
      );
      setFilteredSets(filtered);
    }
  }, [searchTerm, questionSets]);

  const fetchQuestionSets = async () => {
    try {
      setLoading(true);
      const setsRef = ref(database, "attachedQuestionSets");
      const snapshot = await get(setsRef);

      if (!snapshot.exists()) {
        setQuestionSets([]);
        setFilteredSets([]);
        setError("No question sets found!");
        return;
      }

      const sets = Object.entries(snapshot.val());
      const sortedSets = sets.sort(([setNameA], [setNameB]) =>
        setNameB.localeCompare(setNameA)
      );
      setQuestionSets(sortedSets);
      setFilteredSets(sortedSets);
      setError(null);
    } catch (err) {
      console.error("❌ Error fetching question sets:", err);
      setError("Failed to fetch question sets.");
    } finally {
      setLoading(false);
    }
  };

  const isHTML = (str) => {
    return /<[^>]+>/.test(str);
  };
  const handleSetClick = async (setName, setQuestionsData) => {
    setSelectedSet(setName);
    setQuestions([]);
    setLoading(true);
    setError(null);

    try {
      const questionEntries = Object.entries(setQuestionsData);
      let questionsWithOrder = [];

      for (const [key, value] of questionEntries) {
        if (value?.children) {
          const childIds = Array.isArray(value.children)
            ? value.children
            : Object.keys(value.children);

          for (let idx = 0; idx < childIds.length; idx++) {
            const childId = childIds[idx];
            if (!childId || childId.length < 15) {
              console.warn(`⚠️ Skipping invalid child ID: ${childId}`);
              continue;
            }

            questionsWithOrder.push({
              id: childId,
              order: value.order + idx / 10,
            });
          }
        } else {
          const questionId = value.id || key;

          if (!questionId || questionId.length < 15) {
            console.warn(`⚠️ Skipping invalid question ID: ${questionId}`);
            continue;
          }

          questionsWithOrder.push({
            id: questionId,
            order: value.order || 0,
          });
        }


      }

      // Sort by order
      questionsWithOrder.sort((a, b) => a.order - b.order);

      // Fetch all question data
      console.log("👉 IDs to fetch:", questionsWithOrder.map(q => q.id));
      const fetchedQuestions = await Promise.all(
        questionsWithOrder.map(async ({ id, order }) => {
          let questionRef = ref(database, `questions/${id}`);
          let snapshot = await get(questionRef);

          if (!snapshot.exists()) {
            questionRef = ref(database, `multiQuestions/${id}`);
            snapshot = await get(questionRef);
          }

          if (snapshot.exists()) {
            const data = snapshot.val();

            // ✅ Normalize multi-question format
            if (data.mainQuestion && data.subQuestions) {
              return {
                id,
                order,
                question: data.mainQuestion,
                children: data.subQuestions,
                type: 'multi',
              };
            }

            return { id, order, ...data };
          } else {
            console.warn(`❌ Question not found in DB: ${id}`);
            return null;
          }
        })
      );


      setQuestions(fetchedQuestions.filter(Boolean));
    } catch (err) {
      console.error("❌ Error fetching questions:", err);
      setError("Failed to load questions.");
    } finally {
      setLoading(false);
    }
  };

  const deleteQuestionSet = async (setName, e) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete the set "${setName}"?`)) {
      return;
    }

    try {
      setDeleteLoading(true);
      const setRef = ref(database, `attachedQuestionSets/${setName}`);
      await remove(setRef);
      toast.success(`✅ Question set "${setName}" successfully deleted`);

      const updatedSets = questionSets.filter(([name]) => name !== setName);
      setQuestionSets(updatedSets);
      setFilteredSets(updatedSets);

      if (selectedSet === setName) {
        setSelectedSet(null);
        setQuestions([]);
      }
    } catch (err) {
      console.error("❌ Error deleting question set:", err);
      toast.error("❌ Failed to delete question set");
    } finally {
      setDeleteLoading(false);
    }
  };

  const deleteQuestionFromSet = async (questionId) => {
    if (
      !window.confirm("Are you sure you want to remove this question from the set?")
    ) {
      return;
    }

    try {
      setDeleteLoading(true);
      const setRef = ref(database, `attachedQuestionSets/${selectedSet}`);
      const snapshot = await get(setRef);

      if (!snapshot.exists()) {
        toast.error("❌ Set no longer exists");
        return;
      }

      const setData = snapshot.val();
      let keyToRemove = null;
      for (const [key, value] of Object.entries(setData)) {
        if (
          (typeof value === "string" && value === questionId) ||
          (typeof value === "object" && value.id === questionId)
        ) {
          keyToRemove = key;
          break;
        }
      }

      if (!keyToRemove) {
        toast.error("❌ Question not found in set");
        return;
      }

      const questionRef = ref(
        database,
        `attachedQuestionSets/${selectedSet}/${keyToRemove}`
      );
      await remove(questionRef);

      const remainingQuestions = { ...setData };
      delete remainingQuestions[keyToRemove];

      const hasOrderProperty = Object.values(remainingQuestions).some(
        (v) => typeof v === "object" && v.order !== undefined
      );

      if (hasOrderProperty) {
        const orderedQuestions = Object.entries(remainingQuestions)
          .map(([key, value]) => ({
            key,
            data: value,
            order: typeof value === "object" ? value.order || 0 : 0,
          }))
          .sort((a, b) => a.order - b.order);

        const orderUpdatePromises = orderedQuestions.map((item, index) => {
          if (typeof item.data === "object") {
            const updatedRef = ref(
              database,
              `attachedQuestionSets/${selectedSet}/${item.key}`
            );
            return set(updatedRef, { ...item.data, order: index });
          }
          return Promise.resolve();
        });

        await Promise.all(orderUpdatePromises);
      }

      setQuestions((prevQuestions) =>
        prevQuestions.filter((q) => q.id !== questionId)
      );
      toast.success("✅ Question removed from set");
    } catch (err) {
      console.error("❌ Error removing question:", err);
      toast.error("❌ Failed to remove question");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAttachToUser = async () => {
    if (!userEmail.trim()) {
      toast.error("❌ Please enter a username or email!");
      return;
    }

    if (!selectedSet) {
      toast.error("❌ Please select a question set first!");
      return;
    }

    setAttachLoading(true);

    try {
      const formattedEmail = formatEmail(userEmail.trim());
      const usersRef = ref(database, "users");
      const snapshot = await get(usersRef);

      let userKey = null;
      if (snapshot.exists()) {
        const users = snapshot.val();
        userKey = Object.keys(users).find(
          (key) => users[key].email === formattedEmail
        );
      }

      if (!userKey) {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          formattedEmail,
          "123456"
        );
        const newUserRef = ref(database, `users/${userCredential.user.uid}`);
        await set(newUserRef, {
          email: formattedEmail,
          createdAt: new Date().toISOString(),
          role: "user",
        });
        userKey = userCredential.user.uid;
        toast.success(`✅ New user created with email: ${formattedEmail}`);
      }

      const orderedQuestionIds = questions.map((q) => q.id);


      const userSetsRef = ref(
        database,
        `users/${userKey}/assignedSets/${selectedSet}`
      );
      await set(userSetsRef, {
        questions: orderedQuestionIds,
        attachedAt: new Date().toISOString()
      });





      toast.success(`✅ Set "${selectedSet}" attached to ${formattedEmail}`);
      setUserEmail("");
    } catch (err) {
      console.error("❌ Error attaching set to user:", err);
      toast.error("❌ Failed to attach set.");
    } finally {
      setAttachLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // generate barcode

  const generateBarcodeDataUrl = (text) => {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, text, {
      format: "CODE128",
      displayValue: false,
      width: 2,
      height: 40,
      margin: 0,
    });
    return canvas.toDataURL("image/png");
  };


  const exportToPDF = async () => {
    if (!selectedSet || !questions.length || !pdfContentRef.current) {
      toast.error("❌ No question set selected or set is empty");
      return;
    }

    setExportLoading(true);
    pdfContentRef.current.classList.add("pdfExportMode");

    try {
      const barcodeDataUrl = generateBarcodeDataUrl(selectedSet);

      const img = new Image();
      img.src = practiceTime;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const ctx = tempCanvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const logoDataUrl = tempCanvas.toDataURL("image/jpeg");

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const headerHeight = 40;
      const footerHeight = 10;

      const questionItems = pdfContentRef.current.querySelectorAll(".questionWrapperContainer");

      let currentY = headerHeight;
      let currentPage = 1;

      const addHeader = () => {
        const logoWidth = 50;
        const logoHeight = logoWidth / (img.width / img.height);
        pdf.addImage(logoDataUrl, "JPEG", margin, 10, logoWidth, logoHeight);

        const barcodeWidth = 35;
        const barcodeHeight = 10;
        pdf.addImage(barcodeDataUrl, "PNG", pdfWidth - margin - barcodeWidth, 10, barcodeWidth, barcodeHeight);

        pdf.setDrawColor(200);
        pdf.setLineWidth(0.5);
        pdf.line(margin, headerHeight - 5, pdfWidth - margin, headerHeight - 5);

        currentY = headerHeight + 5;
      };

      addHeader();

      for (let itemIndex = 0; itemIndex < questionItems.length; itemIndex++) {
  const item = questionItems[itemIndex];

  // Hide elements marked as noPrint
  const noPrintElements = item.querySelectorAll(".noPrint");
  noPrintElements.forEach(el => (el.style.display = "none"));

  const canvas = await html2canvas(item, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  noPrintElements.forEach(el => (el.style.display = ""));

  const imgData = canvas.toDataURL("image/jpeg", 0.9);
  const imgProps = pdf.getImageProperties(imgData);
  const imgWidth = pdfWidth - 2 * margin;
  const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

  const extraBottomSpace = 15; // margin before footer
  const availablePageHeight = pdfHeight - headerHeight - footerHeight - extraBottomSpace;

  if (imgHeight > availablePageHeight) {
    // Split into chunks
    let remainingHeight = imgHeight;
    let yOffset = 0;

    while (remainingHeight > 0) {
      const sliceHeight = Math.min(availablePageHeight - (currentY - headerHeight), remainingHeight);

      // Create temp slice canvas
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = (sliceHeight * canvas.width) / imgWidth;

      const sliceCtx = sliceCanvas.getContext("2d");
      sliceCtx.drawImage(
        canvas,
        0, yOffset * (canvas.width / imgWidth),
        canvas.width, sliceCanvas.height,
        0, 0,
        sliceCanvas.width, sliceCanvas.height
      );

      const sliceImgData = sliceCanvas.toDataURL("image/jpeg", 0.9);

      if (currentY + sliceHeight > pdfHeight - footerHeight - extraBottomSpace) {
        pdf.addPage();
        addHeader();
      }

      pdf.addImage(sliceImgData, "JPEG", margin, currentY, imgWidth, sliceHeight);
      currentY += sliceHeight + 5;

      remainingHeight -= sliceHeight;
      yOffset += sliceHeight;

      if (remainingHeight > 0 && currentY > pdfHeight - footerHeight - extraBottomSpace) {
        pdf.addPage();
        addHeader();
      }
    }
  } else {
    // Fits on one page
    if (currentY + imgHeight > pdfHeight - footerHeight - extraBottomSpace) {
      pdf.addPage();
      addHeader();
    }
    pdf.addImage(imgData, "JPEG", margin, currentY, imgWidth, imgHeight);
    currentY += imgHeight + 5;
  }

  // ✅ After a question is fully placed, check remaining space
  const remainingSpace = pdfHeight - footerHeight - currentY;
  if (remainingSpace <= 50 && itemIndex < questionItems.length - 1) {
    pdf.addPage();
    addHeader();
  }
}


      pdf.save(`${selectedSet}.pdf`);
    } catch (error) {
      console.error("PDF Export Error:", error);
      toast.error("❌ Failed to export PDF");
    } finally {
      pdfContentRef.current.classList.remove("pdfExportMode");
      setExportLoading(false);
    }
  };


  const handleEditQuestion = (index) => {
    setEditingIndex(index);
    setEditedQuestionText(questions[index].question || "");
  };

  const handleSaveEdit = () => {
    setQuestions((prevQuestions) => {
      const newQuestions = [...prevQuestions];
      newQuestions[editingIndex] = {
        ...newQuestions[editingIndex],
        question: editedQuestionText,
      };
      return newQuestions;
    });
    setEditingIndex(null);
  };


  const handleDeleteQuestion = (indexToDelete) => {
    const updatedQuestions = [...questions];
    updatedQuestions.splice(indexToDelete, 1);
    setQuestions(updatedQuestions); // make sure you're using useState for questions
  };


  // Function to get question number, only counting non-trivia questions
  const getQuestionNumber = (questions, currentIndex) => {
    if (!questions || currentIndex < 0) return 0;

    // Count non-trivia questions up to currentIndex
    return questions
      .slice(0, currentIndex + 1)
      .filter(q => q.type !== "TRIVIA")
      .length;
  };

  return (
    <>
      {editingQuestion && (
        <EditModal
          question={editingQuestion}
          onSave={handleSaveEditedQuestion}
          onClose={() => setEditingQuestion(null)}
        />
      )}

      <div className="allQuestionsContainer">
        <h2>All Question Sets</h2>
        <hr />
        {editingIndex !== null && (
          <div
            style={{
              position: "fixed",
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                backgroundColor: "white",
                padding: 20,
                borderRadius: 8,
                width: "600px",
                maxHeight: "80vh",
                overflowY: "auto",
              }}
            >
              <h3>Edit Question</h3>
              <JoditEditor
                ref={editor}
                value={editedQuestionText}
                onChange={(newContent) => setEditedQuestionText(newContent)}
                tabIndex={1} // tabIndex of textarea
                style={{ height: "250px" }}
              />
              <div
                style={{
                  marginTop: 20,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 12,
                }}
              >
                <button
                  onClick={() => setEditingIndex(null)}
                  style={{
                    backgroundColor: "#f44336",
                    color: "white",
                    padding: "8px 16px",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "bold",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                    transition: "all 0.3s ease",
                  }}
                  onMouseOver={(e) => (e.target.style.backgroundColor = "#d32f2f")}
                  onMouseOut={(e) => (e.target.style.backgroundColor = "#f44336")}
                >
                  Cancel
                </button>

                <button
                  onClick={handleSaveEdit}
                  style={{
                    backgroundColor: "#4CAF50",
                    color: "white",
                    padding: "8px 16px",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "bold",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                    transition: "all 0.3s ease",
                  }}
                  onMouseOver={(e) => (e.target.style.backgroundColor = "#388E3C")}
                  onMouseOut={(e) => (e.target.style.backgroundColor = "#4CAF50")}
                >
                  Save
                </button>
              </div>


            </div>
          </div>
        )}


        <div className="attachToUserSection">
          <h3>Attach Question Set to User</h3>
          <div className="attachForm">
            <input
              type="text"
              placeholder="Enter username or email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
            />
            <button
              onClick={handleAttachToUser}
              disabled={attachLoading || !selectedSet}
              className="attachButton"
            >
              {attachLoading ? "Attaching..." : "Attach Set"}
            </button>
            <div className="hintText">
              {selectedSet ? `Selected set: "${selectedSet}"` : "Select a question set from below"}
            </div>
            <div className="noteText">
              Note: If user does not exist, a new account will be created with default password "123456"
            </div>
          </div>
        </div>

        <hr />

        {error && <p className="errorMessage">{error}</p>}

        {!selectedSet ? (
          <div className="questionSetsList">
            <h3>Available Question Sets</h3>
            <div className="searchContainer">
              <input
                type="text"
                placeholder="Search question sets..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="searchInput"
              />
            </div>

            {loading ? <p>Loading sets...</p> : null}

            {filteredSets.length > 0 ? (
              <ul className="setsList">
                {filteredSets.map(([setName, setQuestionsData]) => (
                  <li key={setName} className="setItem">
                    <div
                      className="setName"
                      onClick={() => handleSetClick(setName, setQuestionsData)}
                    >
                      {setName} ({Object.keys(setQuestionsData).length} questions)
                    </div>
                    <button
                      className="deleteButton"
                      onClick={(e) => deleteQuestionSet(setName, e)}
                      disabled={deleteLoading}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              !loading && (
                <p>
                  {searchTerm
                    ? "No matching sets found. Try a different search term."
                    : "No sets available."}
                </p>
              )
            )}
          </div>
        ) : (
          <div className="selectedSetView">
            <div className="setHeader">
              <button onClick={() => setSelectedSet(null)} className="backButton">
                🔙 Back to Sets
              </button>
              <h3>Questions in "{selectedSet}"</h3>
              <button
                onClick={exportToPDF}
                disabled={exportLoading || !questions.length}
                className="exportButton"
              >
                {exportLoading ? "Exporting..." : "📄 Export to PDF"}
              </button>
            </div>

            {loading ? <p>Loading questions...</p> : null}
            <div
              id="pdf-content"
              ref={pdfContentRef}
              className="pdfContent"
              style={{
                backgroundColor: 'white',
                backgroundImage: 'radial-gradient(rgba(0, 0, 0, 0.15) 1.5px, transparent 1.5px)',
                backgroundSize: '10px 10px',
                padding: '30px',
                fontFamily: "'Geologica', sans-serif",
                color: '#1a1a1a',
                lineHeight: 1.4,
              }}
            >
              {/* Precompute question numbers, skipping trivia */}
              {(() => {
                let nonTriviaCount = 0;
                return (
                  <ul className="questionsList pdfExportMode" style={{ padding: 0 }}>
                    {questions.map((q, index) => {

                      {
                        q.children && Array.isArray(q.children) ? (
                          // 👉 MULTI-TYPE QUESTION RENDERING
                          <li
                            key={q.id || index}
                            className="questionWrapper"
                            style={{
                              borderRadius: '12px',
                              padding: '12px',
                              backgroundColor: '#ffffff',
                              listStyleType: 'none',
                              marginTop: '4px',
                              boxShadow: 'none',
                            }}
                          >
                            <div className="questionContent">
                              <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                                📘 Multi-question set
                              </div>

                              {q.children.map((child, childIndex) => (
                                <div
                                  key={child.id || childIndex}
                                  className="childQuestion"
                                  style={{
                                    borderRadius: '12px',
                                    padding: '12px',
                                    backgroundColor: '#ffffff',
                                    listStyleType: 'none',
                                    marginTop: '4px',
                                    boxShadow: 'none',
                                  }}
                                >
                                  <div style={{ fontWeight: 'bold' }}>
                                    Sub Q{index + 1}.{childIndex + 1}
                                  </div>

                                  <div style={{ marginTop: '6px' }}>
                                    {isHTML(child.question)
                                      ? parse(child.question)
                                      : child.question?.replace(/^\s*\d+[\.\)]\s*/, '')}
                                  </div>

                                  {child.options && (
                                    <ol style={{ marginTop: '5px', paddingLeft: '20px' }}>
                                      {child.options.map((opt, i) => (
                                        <li key={i}>
                                          <strong>{String.fromCharCode(65 + i)}.</strong> {opt.text || opt}
                                        </li>
                                      ))}
                                    </ol>
                                  )}

                                  {child.solution && (
                                    <div style={{ marginTop: '6px', color: 'green' }}>
                                      ✅ <strong>Solution:</strong> {parse(child.solution)}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </li>
                        ) : (
                        // 👉 SINGLE-TYPE QUESTION RENDERING
                        <li
                          key={q.id || index}
                          className="questionWrapper"
                          style={{
                            borderRadius: '12px',
                            padding: '12px',
                            backgroundColor: '#ffffff',
                            listStyleType: 'none',
                            marginTop: '4px',
                            boxShadow: 'none',
                          }}
                        >
                          <div className="questionContent">
                            <div
                              className="questionText"
                              style={{
                                fontSize: '16px',
                                color: '#1a1a1a',
                                marginBottom: '6px',
                              }}
                            >
                              {isHTML(q.question)
                                ? parse(q.question)
                                : q.question?.replace(/^\s*\d+[\.\)]\s*/, '')}
                            </div>

                            {q.questionImage && (
                              <div className="questionImage" style={{ marginBottom: '15px' }}>
                                <img
                                  src={q.questionImage}
                                  alt="Question Attachment"
                                  style={{
                                    maxWidth: '100%',
                                    borderRadius: '8px',
                                    border: '1px solid #eee',
                                  }}
                                />
                              </div>
                            )}

                            {q.options?.some(opt => opt.text?.trim() !== '') && (
                              <ol
                                className="mcqOptions"
                                style={{
                                  marginLeft: '20px',
                                  color: '#555',
                                  fontSize: '15px',
                                  marginBottom: '8px',
                                  listStyleType: 'none',
                                }}
                              >
                                {q.options.map((option, idx) => (
                                  <li key={idx} style={{ marginBottom: '4px' }}>
                                    <strong>{String.fromCharCode(65 + idx)}.</strong> {option.text}
                                  </li>
                                ))}
                              </ol>
                            )}

                            <div
                              className="answerText"
                              style={{
                                backgroundColor: '#d9eaff',
                                padding: '12px 16px',
                                borderRadius: '8px',
                                marginTop: '12px',
                                fontSize: '15px',
                                color: '#333',
                                fontWeight: '600',
                              }}
                            >
                              {q.answer || ''}
                            </div>
                          </div>
                        </li>
                      )
                      }



                      const isTrivia = q.type?.toLowerCase() === 'trivia';
                      const isMulti = Array.isArray(q.children) && q.children.length > 0;

                      if (!isTrivia) nonTriviaCount++;

                      const questionNumber = !isTrivia ? nonTriviaCount : null;

                      return (
                        <div
                          key={q.id || index}
                          className="questionWrapperContainer"
                          style={{ position: 'relative', marginBottom: '20px' }}
                        >
                          <div
                            className="noPrint"
                            style={{
                              position: 'absolute',
                              top: '0',
                              right: '0',
                              zIndex: 10,
                              display: 'flex',
                              gap: '8px',
                            }}
                          >
                            <button
                              className="edit-button"
                              onClick={() => handleEditQuestion(index)}
                              style={{
                                background: '#4CAF50',
                                color: 'white',
                                border: 'none',
                                padding: '6px 10px',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              Edit
                            </button>

                            <button
                              className="delete-button"
                              onClick={() => handleDeleteQuestion(index)}
                              style={{
                                background: '#ff5c5c',
                                color: 'white',
                                border: 'none',
                                padding: '6px 10px',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              Delete
                            </button>
                          </div>

                          {!isTrivia && (
                            <div
                              style={{
                                marginBottom: '6px',
                                display: 'inline-block',
                                fontWeight: 'bold',
                                fontSize: '14px',
                                color: '#191816',
                                border: '2px solid orange',
                                padding: '4px 10px',
                                borderRadius: '25px',
                                backgroundColor: '#fff',
                              }}
                            >
                              QUESTION NO: {questionNumber}
                            </div>
                          )}

                          <li
                            className="questionWrapper"
                            style={{
                              borderRadius: '12px',
                              padding: '12px',
                              backgroundColor: '#ffffff',
                              listStyleType: 'none',
                              marginTop: '4px',
                              boxShadow: 'none',
                            }}
                          >
                            <div className="questionContent">
                              <div
                                className="questionText"
                                style={{
                                  fontSize: '16px',
                                  color: '#1a1a1a',
                                  marginBottom: '6px',
                                  lineHeight: '1.5',
                                  fontFamily: "'Geologica', sans-serif",
                                  fontStyle: 'normal',
                                  fontWeight: 'normal',
                                  letterSpacing: '0.02em',
                                }}
                              >
                                {isHTML(q.question)
                                  ? parse(q.question)
                                  : q.question?.replace(/^\s*\d+[\.\)]\s*/, '')}
                              </div>

                              {q.questionImage && (
                                <div
                                  className="questionImage"
                                  style={{ marginBottom: '15px' }}
                                >
                                  <img
                                    src={q.questionImage}
                                    alt="Question Attachment"
                                    style={{
                                      maxWidth: '100%',
                                      borderRadius: '8px',
                                      border: '1px solid #eee',
                                    }}
                                  />
                                </div>
                              )}

                              {/* 🟡 Sub-question rendering (multi-question support) */}
                              {q.children && Array.isArray(q.children) && (
                                <div className="multiQuestionChildren" style={{ marginTop: '10px' }}>
                                  {q.children.map((child, childIndex) => (
                                    <div
                                      key={child.id || childIndex}
                                      className="childQuestion"
                                      style={{
                                        marginLeft: '20px',
                                        background: '#f9f9f9',
                                        padding: '10px',
                                        borderLeft: '3px solid #ccc',
                                        borderRadius: '4px',
                                        marginBottom: '10px',
                                      }}
                                    >
                                      {/* Sub-question content */}
                                      <div style={{ marginTop: '6px', color: 'green', fontWeight: 'bold' }}>
                                        {isHTML(child.question)
                                          ? parse(child.question)
                                          : child.question?.replace(/^\s*\d+[\.\)]\s*/, '')}
                                      </div>

                                      {/* 🅰️ Options with NO 1.,2.,3. */}
                                      {child.options && (
                                        <div style={{ marginTop: '6px', color: '#555', fontSize: '15px' }}>
                                          {child.type === 'MCQ' ? (
                                            <ol style={{ listStyleType: 'none', paddingLeft: 0 }}>
                                              {child.options.map((opt, i) => (
                                                <li key={i} style={{ marginBottom: '4px' }}>
                                                  <strong>{String.fromCharCode(65 + i)}.</strong> {opt.text || opt}
                                                </li>
                                              ))}
                                            </ol>
                                          ) : (
                                            <div>
                                              {child.options.map((opt, i) => (
                                                <div key={i} style={{ marginBottom: '4px' }}>
                                                  {opt.text || opt}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}


                                      <div className="answerBox">
                                        {child.solution || ''}
                                      </div>


                                    </div>
                                  ))}


                                </div>
                              )}


                              {q.type?.toLowerCase() !== 'fill_in_the_blanks' &&
                                q.options?.some(opt => opt.text?.trim() !== '') && (
                                  <ol
                                    className="mcqOptions"
                                    style={{ marginLeft: '20px', color: '#555', fontSize: '15px', marginBottom: '8px', listStyleType: 'none' }}
                                  >
                                    {q.options.map((option, idx) => {
                                      const label = String.fromCharCode(65 + idx);
                                      return (
                                        <li key={idx} style={{ marginBottom: '4px' }}>
                                          <strong>{label}.</strong> {option.text}
                                        </li>
                                      );
                                    })}
                                  </ol>
                                )}

                              {!isTrivia && !isMulti && (
                                <div
                                  className="answerText"
                                  style={{
                                    backgroundColor: '#d9eaff',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    marginTop: '12px',
                                    fontSize: '15px',
                                    color: '#333',
                                    fontWeight: '600',
                                    lineHeight: '1.4',
                                  }}
                                >
                                  {q.answer || ''}
                                </div>
                              )}


                            </div>

                            {index !== questions.length - 1 && (
                              <hr
                                className="questionSeparator"
                                style={{ border: 'none', borderTop: '1px solid #ccc', margin: '15px 0 0 0' }}
                              />
                            )}
                          </li>
                        </div>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>
          </div>

        )}
      </div>
    </>
  );
};
export default AllQuestionsSet;