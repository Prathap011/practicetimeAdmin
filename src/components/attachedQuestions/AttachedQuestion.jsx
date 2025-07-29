import React, { useEffect, useState } from "react";
import "./AttachedQuestions.css";
import { database } from "../firebase/FirebaseSetup";
import { ref, get, set } from "firebase/database";
import { ToastContainer, toast } from "react-toastify";
import parse from "html-react-parser";
import DynamicMathSelector from "../DynamicMathSelector";
import { useNavigate } from 'react-router-dom';

const AttachedQuestion = () => {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [selectedSetName, setSelectedSetName] = useState("");
  const [error, setError] = useState(null);
  const [setNameError, setSetNameError] = useState("");
  const [loading, setLoading] = useState(false); // Start with false, no initial load
  // State to track if the initial fetch attempt has been made
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  // Filter states - Grade initialized to "all"
  const [grade, setGrade] = useState("all");
  const [topic, setTopic] = useState("all");
  const [topicList, setTopicList] = useState("all");
  const [difficultyLevel, setDifficultyLevel] = useState("all");
  const [questionType, setQuestionType] = useState("all");
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const questionsPerPage = 50;

  // Helper function to determine if any filter is actively selected
  const isAnyFilterActive = () => {
    // Check if any filter is NOT "all" or ""
    return (
      (grade !== "all" && grade !== "") ||
      (topic !== "all" && topic !== "") ||
      (topicList !== "all" && topicList !== "") ||
      (difficultyLevel !== "all" && difficultyLevel !== "") ||
      (questionType !== "all" && questionType !== "")
    );
  };

  // Function to fetch all questions
  const fetchAllQuestions = async () => {
    // Prevent multiple simultaneous fetches
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const questionsRef = ref(database, "questions");
      const snapshot = await get(questionsRef);
      if (!snapshot.exists()) {
        setError("No questions found!");
        setQuestions([]); // Ensure questions array is cleared
        return;
      }
      const data = snapshot.val();
      let allFetchedQuestions = Object.keys(data).map((questionId) => ({
        id: questionId,
        ...data[questionId],
      }));
      allFetchedQuestions.reverse();
      setQuestions(allFetchedQuestions);
      // Success, mark that we've fetched
      setHasFetchedOnce(true);
    } catch (err) {
      console.error("Error fetching questions:", err);
      setError("Failed to fetch questions");
      setQuestions([]); // Ensure questions array is cleared on error
      setHasFetchedOnce(true); // Mark as fetched even on error to prevent retries
    } finally {
      setLoading(false);
    }
  };

  // Apply filters and potentially fetch data
  useEffect(() => {
    // If data hasn't been fetched yet AND at least one filter is active, fetch it
    if (!hasFetchedOnce && questions.length === 0 && isAnyFilterActive()) {
      fetchAllQuestions();
      return; // Exit effect, it will re-run after fetch updates state
    }
    // If data is loaded (or intentionally empty/errored after fetch) and not loading, apply filters
    if (hasFetchedOnce && !loading) {
      const filtered = questions.filter((q) => {
        // --- CORRECTED FILTER LOGIC ---
        const matchesGrade = grade === "all" || grade === "" || q.grade === grade;
        const matchesTopic = topic === "all" || topic === "" || q.topic === topic;
        const matchesTopicList = topicList === "all" || topicList === "" || q.topicList === topicList;
        const matchesDifficulty = difficultyLevel === "all" || difficultyLevel === "" || q.difficultyLevel === difficultyLevel;
        const matchesType = questionType === "all" || questionType === "" || q.type === questionType;
        // --- END CORRECTION ---
        return matchesGrade && matchesTopic && matchesTopicList && matchesDifficulty && matchesType;
      });
      setFilteredQuestions(filtered);
      setCurrentPage(1); // Reset to page 1 on new filter
    }
  }, [questions, grade, topic, topicList, difficultyLevel, questionType, loading, hasFetchedOnce]); // Dependencies

  const handleAddToSet = async (questionId) => {
    if (!selectedSetName.trim()) {
      setSetNameError("❌ Please enter a valid set name!");
      return;
    }
    setSetNameError("");
    try {
      const setRef = ref(database, `attachedQuestionSets/${selectedSetName}`);
      const snapshot = await get(setRef);
      let nextOrder = 0;
      if (snapshot.exists()) {
        const existingSet = snapshot.val();
        const existingQuestion = Object.values(existingSet).find(
          (item) =>
            (typeof item === "string" && item === questionId) ||
            (typeof item === "object" && item.id === questionId)
        );
        if (existingQuestion) {
          toast.warning(`⚠️ This question is already in set: ${selectedSetName}`);
          return;
        }
        const orders = Object.values(existingSet)
          .map((item) => (typeof item === "object" && item.order !== undefined ? item.order : -1))
          .filter((order) => order !== -1);
        nextOrder = orders.length > 0 ? Math.max(...orders) + 1 : 0;
      }
      const questionRef = ref(database, `attachedQuestionSets/${selectedSetName}/${questionId}`);
      await set(questionRef, {
        id: questionId,
        order: nextOrder,
        addedAt: Date.now(),
      });
      toast.success(`✅ Question added to set: ${selectedSetName} at position ${nextOrder}`);
    } catch (err) {
      console.error("❌ Error adding question to set:", err);
      setError("Failed to attach question to set.");
    }
  };

  // Function to check if a string contains HTML tags
  const isHTML = (str) => {
    return /<[^>]+>/.test(str);
  };

  // Pagination logic
  const indexOfLast = currentPage * questionsPerPage;
  const indexOfFirst = indexOfLast - questionsPerPage;
  const currentQuestions = filteredQuestions.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredQuestions.length / questionsPerPage);

  // --- START: Truncated Pagination Logic ---
  // Helper function for pagination truncation
  const getVisiblePageNumbers = (currentPage, totalPages, maxVisible = 10) => {
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const halfVisible = Math.floor(maxVisible / 2);
    let startPage = Math.max(1, currentPage - halfVisible);
    let endPage = Math.min(totalPages, currentPage + halfVisible);
    if (currentPage <= halfVisible) {
      endPage = maxVisible;
    }
    if (currentPage + halfVisible >= totalPages) {
      startPage = totalPages - maxVisible + 1;
    }
    const pages = [];
    if (startPage > 1) {
      pages.push(1);
      if (startPage > 2) {
        pages.push('...');
      }
    }
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push('...');
      }
      pages.push(totalPages);
    }
    return pages;
  };
  // --- END: Truncated Pagination Logic ---

  // --- START: Function to render questions with duplicate check ---
  const renderQuestionsWithDuplicateCheck = (questionsToRender) => {
    return questionsToRender.reduce((renderedItems, q, index, array) => {
      // Determine the content used for comparison (text)
      const currentQuestionText = q.question ? q.question.trim() : '';

      // Get the text of the last question that was actually rendered (not just checked)
      let lastRenderedQuestionText = '';
      if (renderedItems.length > 0) {
        // Access the question object stored on the last rendered <li> element
        lastRenderedQuestionText = renderedItems[renderedItems.length - 1].props.questionText || '';
      }

      // Check if the current question text is the same as the last one rendered
      const isDuplicateOfPrevious = currentQuestionText === lastRenderedQuestionText;

      if (isDuplicateOfPrevious) {
        // If duplicate, skip rendering this item
        return renderedItems;
      } else {
        // If not a duplicate, render the <li> for this question
        const questionItem = (
          <li key={q.id} className="questionItem attachedQuestionItem" questionText={currentQuestionText}>
            <strong>{isHTML(q.question) ? parse(q.question) : q.question}</strong> ({q.type})
            <div className="questionMeta">
              {q.grade && <span className="tag">Grade: {q.grade}</span>}
              {q.topic && <span className="tag">Topic: {q.topic}</span>}
              {q.topicList && <span className="tag">Subtopic: {q.topicList}</span>}
              {q.difficultyLevel && <span className="tag">Difficulty: {q.difficultyLevel}</span>}
            </div>
            {q.questionImage && (
              <div>
                <img
                  src={q.questionImage}
                  alt="Question Attachment"
                  style={{ maxWidth: "300px", marginTop: "10px" }}
                />
              </div>
            )}
            {q.type === "MCQ" && Array.isArray(q.options) && (
              <ul>
                {q.options.map((option, index) => (
                  <li key={index}>
                    {option.text}
                    {option.image && (
                      <img
                        src={option.image}
                        alt={`Option ${index + 1}`}
                        style={{ maxWidth: "100px", marginLeft: "10px" }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {q.correctAnswer && (
              <p>
                <strong>Correct Answer:</strong> {q.correctAnswer.text}
                {q.correctAnswer.image && (
                  <img
                    src={q.correctAnswer.image}
                    alt="Correct Answer"
                    style={{ maxWidth: "100px", marginLeft: "10px" }}
                  />
                )}
              </p>
            )}
            <div>
              <button className="addQuestionButton" onClick={() => handleAddToSet(q.id)}>
                {selectedSetName ? `Add question to ${selectedSetName}` : "Add to Set"}
              </button>
            </div>
          </li>
        );
        renderedItems.push(questionItem);
        return renderedItems;
      }
    }, []); // Initialize with an empty array for rendered items
  };
  // --- END: Function to render questions with duplicate check ---


  return (
    <div className="allQuestionContainer attachedQuestionsContainer">
      <h2>All Questions</h2>
      <hr />
      <div className="set-name-input">
        <input
          type="text"
          value={selectedSetName}
          onChange={(e) => setSelectedSetName(e.target.value)}
          placeholder="Enter set name"
          className="set-name-field"
        />
        {setNameError && <p style={{ color: "red" }}>{setNameError}</p>}
      </div>
      <hr />
      {/* Filter Controls - Always visible */}
      <div className="filterControls">
        <div className="horizontal-filters">
          <DynamicMathSelector
            grade={grade}
            setGrade={setGrade}
            topic={topic}
            setTopic={setTopic}
            topicList={topicList}
            setTopicList={setTopicList}
          />
          <div className="formGroup">
            <label htmlFor="questionTypeFilter">Question Type:</label>
            <select
              id="questionTypeFilter"
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="MCQ">MCQ</option>
              <option value="FILL_IN_THE_BLANKS">Fill in the Blanks</option>
              <option value="TRIVIA">Trivia</option>
            </select>
          </div>
          <div className="formGroup">
            <label htmlFor="difficultyFilter">Difficulty Level:</label>
            <select
              id="difficultyFilter"
              value={difficultyLevel}
              onChange={(e) => setDifficultyLevel(e.target.value)}
            >
              <option value="all">All Difficulty Levels</option>
              {["L1", "L2", "L3", "Br"].map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </div>
        </div>
      </div>
      {/* Content Area - Below Filters */}
      {error && <p style={{ color: "red" }}>{error}</p>}
      <div className="formGroup">
            <button onClick={() => navigate("/multi-questions")}>
              View Multi-Questions
            </button>
          </div>
      {/* Show loading message below filters */}
      {loading && <p>Loading questions...</p>}
      {/* Show content (stats, questions, pagination) only when not loading and no error */}
      {!loading && !error && (
        <>
         {/* Show instruction if no fetch has happened and no filters are active */}
         {!hasFetchedOnce && !isAnyFilterActive() && (
           <p>Please select a filter to load questions.</p>
         )}
         {/* Show stats and questions only if data has been fetched */}
         {hasFetchedOnce && (
           <>
             <div className="questionStats">
               <p>Showing {renderQuestionsWithDuplicateCheck(currentQuestions).length} of {filteredQuestions.length} filtered questions (Total: {questions.length})</p>
             </div>
             {/* Check for "No questions found" after loading, filtering, and ensuring no error */}
             {filteredQuestions.length === 0 ? (
               <p>No questions match the selected filters.</p> // More specific message
             ) : (
               <div className="questionList attachedQuestionList">
                 <ol>
                   {/* --- START: Use the new rendering function --- */}
                   {renderQuestionsWithDuplicateCheck(currentQuestions)}
                   {/* --- END: Use the new rendering function --- */}
                 </ol>
               </div>
             )}
           </>
         )}
          {/* Pagination - Truncated - Show only if data has been fetched and there are pages */}
          {hasFetchedOnce && totalPages > 1 && (
            <div className="pagination">
              {getVisiblePageNumbers(currentPage, totalPages, 10).map((pageNum, index) => (
                <button
                  key={`${pageNum}-${index}`}
                  onClick={() => typeof pageNum === 'number' && setCurrentPage(pageNum)}
                  className={
                    currentPage === pageNum
                      ? "active"
                      : typeof pageNum === 'number'
                      ? ""
                      : "ellipsis"
                  }
                  disabled={typeof pageNum !== 'number'}
                  aria-label={typeof pageNum === 'number' ? `Go to page ${pageNum}` : `Page gap`}
                >
                  {pageNum}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <ToastContainer />
    </div>
  );
};

export default AttachedQuestion;