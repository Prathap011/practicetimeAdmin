// MultiQuestionPage.js
import React, { useEffect, useState } from "react";
import "./AttachedQuestions.css"; // Reuse the same CSS
import { database } from "../firebase/FirebaseSetup";
import { ref, get, set, remove } from "firebase/database"; // Added 'remove'
import { ToastContainer, toast } from "react-toastify";
import parse from "html-react-parser";
import DynamicMathSelector from "../DynamicMathSelector";
import { useNavigate } from "react-router-dom";

const MultiQuestionPage = () => {
  const navigate = useNavigate();
  const [multiQuestions, setMultiQuestions] = useState([]); // Stores fetched multi-questions
  const [displayQuestions, setDisplayQuestions] = useState([]); // Flattened list for display
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [selectedSetName, setSelectedSetName] = useState("");
  const [error, setError] = useState(null);
  const [setNameError, setSetNameError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false); // For delete loading state
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);

  // Filter states
  const [grade, setGrade] = useState("all");
  const [topic, setTopic] = useState("all");
  const [topicList, setTopicList] = useState("all");
  const [difficultyLevel, setDifficultyLevel] = useState("all");
  const [questionType, setQuestionType] = useState("all");
  const [searchTerm, setSearchTerm] = useState(""); // NEW: Search term

  const [currentPage, setCurrentPage] = useState(1);
  const questionsPerPage = 50;

  // Helper: Check if any filter (including search) is active
  const isAnyFilterActive = () => {
    return (
      (grade !== "all" && grade !== "") ||
      (topic !== "all" && topic !== "") ||
      (topicList !== "all" && topicList !== "") ||
      (difficultyLevel !== "all" && difficultyLevel !== "") ||
      (questionType !== "all" && questionType !== "") ||
      (searchTerm.trim() !== "")
    );
  };

  // Fetch multi-questions
  const fetchMultiQuestions = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const multiQuestionsRef = ref(database, "multiQuestions");
      const snapshot = await get(multiQuestionsRef);
      if (!snapshot.exists()) {
        setError("No multi-questions found!");
        setMultiQuestions([]);
        setDisplayQuestions([]);
        setFilteredQuestions([]);
        setHasFetchedOnce(true);
        return;
      }

      const rawData = snapshot.val();
      let fetchedMultiQuestions = Object.keys(rawData).map((multiQuestionId) => {
        const mqData = rawData[multiQuestionId];
        const safeSubQuestions = Array.isArray(mqData.subQuestions) ? mqData.subQuestions : [];
        return {
          id: multiQuestionId,
          ...mqData,
          subQuestions: safeSubQuestions,
        };
      });

      fetchedMultiQuestions.reverse();
      setMultiQuestions(fetchedMultiQuestions);

      // Flatten sub-questions for display
      const flattened = fetchedMultiQuestions.flatMap((mq) =>
        mq.subQuestions.map((sq, index) => ({
          mainQuestionId: mq.id,
          mainQuestion: mq.mainQuestion,
          createdAt: mq.createdAt,
          difficultyLevel: mq.difficultyLevel,
          grade: mq.grade,
          topic: mq.topic,
          topicList: mq.topicList || mq.topiclist, // Handle possible typo
          type: mq.type || "MULTI",
          ...sq,
          subQuestionIndex: index,
          totalSubQuestions: mq.subQuestions.length,
        }))
      );

      setDisplayQuestions(flattened);
      setHasFetchedOnce(true);
    } catch (err) {
      console.error("Error fetching multi-questions:", err);
      setError("Failed to fetch multi-questions: " + err.message);
      setMultiQuestions([]);
      setDisplayQuestions([]);
      setFilteredQuestions([]);
      setHasFetchedOnce(true);
    } finally {
      setLoading(false);
    }
  };

  // Apply filters and search
  useEffect(() => {
    if (!hasFetchedOnce && displayQuestions.length === 0 && isAnyFilterActive()) {
      fetchMultiQuestions();
      return;
    }

    if (hasFetchedOnce && !loading) {
      const filtered = displayQuestions.filter((q) => {
        const matchesGrade = grade === "all" || grade === "" || q.grade === grade;
        const matchesTopic = topic === "all" || topic === "" || q.topic === topic;
        const matchesTopicList = topicList === "all" || topicList === "" || q.topicList === topicList;
        const matchesDifficulty = difficultyLevel === "all" || difficultyLevel === "" || q.difficultyLevel === difficultyLevel;
        const matchesType = questionType === "all" || questionType === "" || q.type === questionType;

        // Search logic
        let matchesSearch = true;
        if (searchTerm.trim() !== "") {
          const lowerSearchTerm = searchTerm.toLowerCase().trim();
          matchesSearch =
            (q.mainQuestion && typeof q.mainQuestion === 'string' && q.mainQuestion.toLowerCase().includes(lowerSearchTerm)) ||
            (q.question && typeof q.question === 'string' && q.question.toLowerCase().includes(lowerSearchTerm)) ||
            (q.grade && typeof q.grade === 'string' && q.grade.toLowerCase().includes(lowerSearchTerm)) ||
            (q.topic && typeof q.topic === 'string' && q.topic.toLowerCase().includes(lowerSearchTerm)) ||
            (q.topicList && typeof q.topicList === 'string' && q.topicList.toLowerCase().includes(lowerSearchTerm)) ||
            (q.difficultyLevel && typeof q.difficultyLevel === 'string' && q.difficultyLevel.toLowerCase().includes(lowerSearchTerm)) ||
            (q.type && typeof q.type === 'string' && q.type.toLowerCase().includes(lowerSearchTerm)) ||
            (q.correctAnswer?.text && typeof q.correctAnswer.text === 'string' && q.correctAnswer.text.toLowerCase().includes(lowerSearchTerm));

          // Search in MCQ options
          if (!matchesSearch && q.type === "MCQ" && Array.isArray(q.options)) {
            matchesSearch = q.options.some(
              (option) =>
                option.text &&
                typeof option.text === 'string' &&
                option.text.toLowerCase().includes(lowerSearchTerm)
            );
          }
        }

        return matchesGrade && matchesTopic && matchesTopicList && matchesDifficulty && matchesType && matchesSearch;
      });

      setFilteredQuestions(filtered);
      setCurrentPage(1);
    }
  }, [
    displayQuestions,
    grade,
    topic,
    topicList,
    difficultyLevel,
    questionType,
    searchTerm,
    loading,
    hasFetchedOnce,
  ]);

  // Add multi-question to a set
  const handleAddToSet = async (mainQuestionId) => {
    if (!selectedSetName.trim()) {
      setSetNameError("❌ Please enter a valid set name!");
      return;
    }
    setSetNameError("");
    const fullMultiQuestion = multiQuestions.find((mq) => mq.id === mainQuestionId);
    if (!fullMultiQuestion) {
      toast.error("Multi-question data not found.");
      return;
    }

    try {
      const setRef = ref(database, `attachedQuestionSets/${selectedSetName}`);
      const snapshot = await get(setRef);
      let nextOrder = 0;
      if (snapshot.exists()) {
        const existingSet = snapshot.val();
        const existingQuestion = Object.values(existingSet).find(
          (item) => (typeof item === "object" && item.id === mainQuestionId)
        );
        if (existingQuestion) {
          toast.warning(`⚠️ This multi-question is already in set: ${selectedSetName}`);
          return;
        }
        const orders = Object.values(existingSet)
          .map((item) => (typeof item === "object" && item.order !== undefined ? item.order : -1))
          .filter((order) => order !== -1);
        nextOrder = orders.length > 0 ? Math.max(...orders) + 1 : 0;
      }

      const questionRef = ref(database, `attachedQuestionSets/${selectedSetName}/${mainQuestionId}`);
      await set(questionRef, {
        ...fullMultiQuestion,
        order: nextOrder,
        addedAt: Date.now(),
        isMultiQuestion: true,
      });
      toast.success(`✅ Multi-question added to set: ${selectedSetName} at position ${nextOrder}`);
    } catch (err) {
      console.error("❌ Error adding multi-question to set:", err);
      setError("Failed to attach multi-question to set.");
      toast.error("❌ Failed to add to set.");
    }
  };

  // 🔥 NEW: Delete filtered sub-questions (keep one)
  const handleDeleteFilteredQuestions = async () => {
    if (filteredQuestions.length <= 1) {
      toast.info("Not enough filtered questions to delete — at least one will remain.");
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to delete ${filteredQuestions.length - 1} filtered sub-questions? One will remain.`
    );
    if (!confirmDelete) return;

    setDeleting(true);
    setError(null);
    try {
      // Group sub-questions by their mainQuestionId
      const mainQuestionIdsToDelete = new Set();
      const subQuestionsToKeep = new Set(); // Track which sub-question index to keep

      // Keep the first sub-question from the filtered list
      const questionToKeep = filteredQuestions[0];
      subQuestionsToKeep.add(`${questionToKeep.mainQuestionId}-${questionToKeep.subQuestionIndex}`);

      // Mark all other filtered sub-questions for deletion
      const deletions = filteredQuestions.slice(1).map(async (q) => {
        mainQuestionIdsToDelete.add(q.mainQuestionId);
        const subIndex = q.subQuestionIndex;

        // Update the parent multiQuestion by removing this sub-question
        const multiQuestionRef = ref(database, `multiQuestions/${q.mainQuestionId}`);
        const snapshot = await get(multiQuestionRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const updatedSubQuestions = data.subQuestions.filter((_, index) => index !== subIndex);

          // If only one sub-question remains, don't delete the whole multi-question
          if (updatedSubQuestions.length === 0) {
            // Remove the entire multi-question
            return remove(multiQuestionRef);
          } else {
            // Just update subQuestions array
            return set(multiQuestionRef, {
              ...data,
              subQuestions: updatedSubQuestions,
            });
          }
        }
      });

      await Promise.all(deletions);

      toast.success(`✅ Deleted ${filteredQuestions.length - 1} sub-questions.`);
      await fetchMultiQuestions(); // Refresh data
    } catch (err) {
      console.error("❌ Error deleting filtered multi-questions:", err);
      setError("Failed to delete questions.");
      toast.error("❌ Failed to delete.");
    } finally {
      setDeleting(false);
    }
  };

  const isHTML = (str) => {
    return /<[^>]+>/.test(str);
  };

  // Pagination logic
  const indexOfLast = currentPage * questionsPerPage;
  const indexOfFirst = indexOfLast - questionsPerPage;
  const currentQuestions = filteredQuestions.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredQuestions.length / questionsPerPage);

  const getVisiblePageNumbers = (currentPage, totalPages, maxVisible = 10) => {
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const halfVisible = Math.floor(maxVisible / 2);
    let startPage = Math.max(1, currentPage - halfVisible);
    let endPage = Math.min(totalPages, currentPage + halfVisible);
    if (currentPage <= halfVisible) endPage = maxVisible;
    if (currentPage + halfVisible >= totalPages) startPage = totalPages - maxVisible + 1;

    const pages = [];
    if (startPage > 1) {
      pages.push(1);
      if (startPage > 2) pages.push('...');
    }
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="allQuestionContainer attachedQuestionsContainer">
      <h2>Multi-Questions</h2>
      <div className="formGroup">
        <button onClick={() => navigate("/attached-questions")}>
          ← Back to All Questions
        </button>
      </div>
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

      {/* Filter & Search Controls */}
      <div className="filterControls">
        <div className="formGroup" style={{ marginBottom: '15px' }}>
          <label htmlFor="searchFilter">Search Sub-Questions:</label>
          <input
            type="text"
            id="searchFilter"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by main/sub question, topic, difficulty, etc."
            style={{ padding: '8px', width: '300px', marginLeft: '10px' }}
          />
        </div>

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
              {["L1", "L2", "L3", "Br"].map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>

          {/* Delete Filtered Button */}
          <div className="formGroup">
            <button
              onClick={handleDeleteFilteredQuestions}
              disabled={deleting || !hasFetchedOnce || filteredQuestions.length === 0}
              style={{
                backgroundColor: '#d9534f',
                color: 'white',
                border: 'none',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              {deleting ? 'Deleting...' : `Delete ${filteredQuestions.length} Filtered`}
            </button>
          </div>
        </div>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading && <p>Loading multi-questions...</p>}
      {deleting && <p>Deleting filtered sub-questions...</p>}

      {!loading && !error && !deleting && (
        <>
          {!hasFetchedOnce && !isAnyFilterActive() ? (
            <p>Please select a filter or enter a search term to load multi-questions.</p>
          ) : (
            <>
              <div className="questionStats">
                <p>
                  Showing {currentQuestions.length} of {filteredQuestions.length} filtered sub-questions 
                  (Total Multi-Questions: {multiQuestions.length})
                </p>
              </div>

              {filteredQuestions.length === 0 ? (
                <p>No sub-questions match the selected filters or search term.</p>
              ) : (
                <div className="questionList attachedQuestionList">
                  <ol>
                    {currentQuestions.map((q) => (
                      <li
                        key={`${q.mainQuestionId}-${q.subQuestionIndex}`}
                        className="questionItem attachedQuestionItem"
                      >
                        <div>
                          <strong>Main Question ({q.subQuestionIndex + 1}/{q.totalSubQuestions}):</strong>{" "}
                          {isHTML(q.mainQuestion) ? parse(q.mainQuestion) : q.mainQuestion}
                        </div>
                        <div>
                          <strong>Sub-Question:</strong>{" "}
                          {isHTML(q.question) ? parse(q.question) : q.question}
                        </div>

                        <div className="questionMeta">
                          {q.grade && <span className="tag">Grade: {q.grade}</span>}
                          {q.topic && <span className="tag">Topic: {q.topic}</span>}
                          {q.topicList && <span className="tag">Subtopic: {q.topicList}</span>}
                          {q.difficultyLevel && <span className="tag">Difficulty: {q.difficultyLevel}</span>}
                          {q.type && <span className="tag">Type: {q.type}</span>}
                        </div>

                        {q.questionImage && (
                          <div>
                            <img
                              src={q.questionImage}
                              alt="Sub-question"
                              style={{ maxWidth: "300px", marginTop: "10px" }}
                            />
                          </div>
                        )}

                        {q.type === "MCQ" && Array.isArray(q.options) && (
                          <ul>
                            {q.options.map((option, idx) => (
                              <li key={idx}>
                                {option.text}
                                {option.image && (
                                  <img
                                    src={option.image}
                                    alt={`Option ${idx + 1}`}
                                    style={{ maxWidth: "100px", marginLeft: "10px" }}
                                  />
                                )}
                              </li>
                            ))}
                          </ul>
                        )}

                        {q.correctAnswer && (
                          <p>
                            <strong>Correct Answer:</strong>{" "}
                            {q.correctAnswer.text}
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
                          <button
                            className="addQuestionButton"
                            onClick={() => handleAddToSet(q.mainQuestionId)}
                          >
                            {selectedSetName
                              ? `Add multi-question to ${selectedSetName}`
                              : "Add Multi-Question to Set"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {totalPages > 1 && (
                <div className="pagination">
                  {getVisiblePageNumbers(currentPage, totalPages).map((pageNum, index) => (
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
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <ToastContainer />
    </div>
  );
};

export default MultiQuestionPage;