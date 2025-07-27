import React, { useEffect, useState } from "react";
import "./AttachedQuestions.css";
import { database } from "../firebase/FirebaseSetup";
import { ref, get, set } from "firebase/database";
import { ToastContainer, toast } from "react-toastify";
import parse from "html-react-parser";
import DynamicMathSelector from "../DynamicMathSelector";

const AttachedQuestion = () => {
  const [questions, setQuestions] = useState([]);
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [selectedSetName, setSelectedSetName] = useState("");
  const [error, setError] = useState(null);
  const [setNameError, setSetNameError] = useState("");
  // Add loading state
  const [loading, setLoading] = useState(true);

  // Filter states - Grade initialized to "G4"
  const [grade, setGrade] = useState("G4"); // Default to G4
  const [topic, setTopic] = useState("all");
  const [topicList, setTopicList] = useState("all");
  const [difficultyLevel, setDifficultyLevel] = useState("all");
  const [questionType, setQuestionType] = useState("all");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const questionsPerPage = 50;

  useEffect(() => {
    const fetchAllQuestions = async () => {
      // Indicate loading has started
      setLoading(true);
      setError(null); // Clear any previous errors
      try {
        const questionsRef = ref(database, "questions");
        const snapshot = await get(questionsRef);
        if (!snapshot.exists()) {
          setError("No questions found!");
          return;
        }
        const data = snapshot.val();
        let allFetchedQuestions = Object.keys(data).map((questionId) => ({
          id: questionId,
          ...data[questionId],
        }));
        allFetchedQuestions.reverse();
        setQuestions(allFetchedQuestions);
        // Note: filteredQuestions will be updated by the filter useEffect below
        // because 'questions' is a dependency.
      } catch (err) {
        console.error("Error fetching questions:", err);
        setError("Failed to fetch questions");
      } finally {
        // Ensure loading is set to false when fetch completes (success or error)
        setLoading(false);
      }
    };
    fetchAllQuestions();
  }, []); // Dependency array is empty, runs once on mount

  // Apply filters when any filter value, questions, or loading state changes
  useEffect(() => {
    // If still loading, don't filter yet or if questions haven't loaded
    if (loading || questions.length === 0) {
      // Optionally reset filtered questions while loading or waiting for data
      // setFilteredQuestions([]);
      return;
    }

    const filtered = questions.filter((q) => {
      // --- CORRECTED FILTER LOGIC ---
      // Treat empty string ("") the same as "all" for filter inputs
      const matchesGrade = grade === "all" || grade === "" || q.grade === grade;
      const matchesTopic = topic === "all" || topic === "" || q.topic === topic;
      const matchesTopicList = topicList === "all" || topicList === "" || q.topicList === topicList;
      const matchesDifficulty = difficultyLevel === "all" || difficultyLevel === "" || q.difficultyLevel === difficultyLevel;
      const matchesType = questionType === "all" || questionType === "" || q.type === questionType;
      // --- END CORRECTION ---

      // console.log(`Question ${q.id} - Grade Match: ${matchesGrade} (q.grade: ${q.grade}), Topic Match: ${matchesTopic}, ...`);
      return matchesGrade && matchesTopic && matchesTopicList && matchesDifficulty && matchesType;
    });
    setFilteredQuestions(filtered);
    setCurrentPage(1); // Reset to page 1 on new filter
  }, [questions, grade, topic, topicList, difficultyLevel, questionType, loading]); // Dependencies

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

      {/* Show loading message below filters */}
      {loading && <p>Loading questions...</p>}

      {/* Show content (stats, questions, pagination) only when not loading and no error */}
      {!loading && !error && (
        <>
          <div className="questionStats">
            <p>Showing {currentQuestions.length} of {filteredQuestions.length} filtered questions (Total: {questions.length})</p>
          </div>

          {/* Check for "No questions found" after loading, filtering, and ensuring no error */}
          {filteredQuestions.length === 0 ? (
            <p>No questions found!</p>
          ) : (
            <div className="questionList attachedQuestionList">
              <ol>
                {currentQuestions.map((q) => (
                  <li key={q.id} className="questionItem attachedQuestionItem">
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
                ))}
              </ol>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={currentPage === i + 1 ? "active" : ""}
                >
                  {i + 1}
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